import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app=express(),port=Number(process.env.PORT)||4000,prod=process.env.NODE_ENV==='production';
const categories=['tasks','habits','habitLogs','courses','modules','topics','learningSessions','careerGoals','projects','projectFeatures','applications','events','workouts','bodyMeasurements','books','readingSessions','knowledgeItems','reflections'];
const userSchema=new mongoose.Schema({email:{type:String,required:true,unique:true,lowercase:true,trim:true},passwordHash:{type:String,required:true}},{timestamps:true});
const recordSchema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},collection:{type:String,required:true,enum:categories},recordId:{type:String,required:true},data:{type:mongoose.Schema.Types.Mixed,required:true}},{timestamps:true});
recordSchema.index({userId:1,collection:1,recordId:1},{unique:true});
const User=mongoose.model('User',userSchema),Record=mongoose.model('Record',recordSchema);
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));app.use(express.json({limit:'2mb',strict:true}));app.use(cookieParser());
const authLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false});
const tokenSecret=()=>{if(!process.env.JWT_SECRET)throw new Error('JWT_SECRET is not configured');return process.env.JWT_SECRET};
function setToken(res,user){const token=jwt.sign({sub:String(user._id)},tokenSecret(),{expiresIn:'7d',issuer:'northstar'});res.cookie('northstar_session',token,{httpOnly:true,secure:prod,sameSite:'strict',path:'/',maxAge:7*86400000})}
function hasSafeKeys(value,depth=0){if(depth>12)return false;if(!value||typeof value!=='object')return true;for(const [key,child] of Object.entries(value)){if(key==='__proto__'||key==='prototype'||key==='constructor'||key.startsWith('$')||key.includes('.'))return false;if(!hasSafeKeys(child,depth+1))return false}return true}
function requireAuth(req,res,next){try{const token=req.cookies.northstar_session;if(!token)return res.status(401).json({error:'Sign in to sync your workspace.'});const claims=jwt.verify(token,tokenSecret(),{issuer:'northstar'});req.userId=claims.sub;next()}catch{return res.status(401).json({error:'Your session expired. Sign in again.'})}}
app.get('/api/health',(_req,res)=>{const ok=mongoose.connection.readyState===1;res.status(ok?200:503).json({ok,database:ok?'connected':'disconnected'})});
app.post('/api/auth/register',authLimiter,async(req,res,next)=>{try{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:'Enter a valid email address.'});if(password.length<12||password.length>128)return res.status(400).json({error:'Use a password between 12 and 128 characters.'});const user=await User.create({email,passwordHash:await bcrypt.hash(password,12)});setToken(res,user);res.status(201).json({email:user.email})}catch(e){if(e.code===11000)return res.status(409).json({error:'An account already exists for this email.'});next(e)}});
app.post('/api/auth/login',authLimiter,async(req,res,next)=>{try{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),user=await User.findOne({email});if(!user||!await bcrypt.compare(password,user.passwordHash))return res.status(401).json({error:'Email or password is incorrect.'});setToken(res,user);res.json({email:user.email})}catch(e){next(e)}});
app.post('/api/auth/logout',(_req,res)=>{res.clearCookie('northstar_session',{httpOnly:true,secure:prod,sameSite:'strict',path:'/'});res.json({ok:true})});
app.get('/api/auth/session',requireAuth,async(req,res,next)=>{try{const user=await User.findById(req.userId).select('email');if(!user)return res.status(401).json({error:'Account no longer exists.'});res.json({email:user.email})}catch(e){next(e)}});
app.get('/api/sync',requireAuth,async(req,res,next)=>{try{const rows=await Record.find({userId:req.userId}).lean(),data=Object.fromEntries(categories.map(k=>[k,[]]));for(const row of rows)data[row.collection].push(row.data);res.json({data})}catch(e){next(e)}});
app.post('/api/sync',requireAuth,async(req,res,next)=>{try{const data=req.body?.data;if(!data||typeof data!=='object'||Array.isArray(data))return res.status(400).json({error:'Expected workspace data.'});const ops=[];let bytes=0;for(const key of categories){if(data[key]===undefined)continue;if(!Array.isArray(data[key]))return res.status(400).json({error:`Invalid ${key} collection.`});for(const item of data[key]){if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||item.id.length>100||!hasSafeKeys(item))return res.status(400).json({error:`Invalid record in ${key}.`});const serialized=JSON.stringify(item);bytes+=Buffer.byteLength(serialized);if(bytes>1_500_000)return res.status(413).json({error:'Workspace sync is too large.'});ops.push({updateOne:{filter:{userId:req.userId,collection:key,recordId:item.id},update:{$set:{data:item}},upsert:true}})}}if(ops.length)await Record.bulkWrite(ops,{ordered:false});res.json({saved:ops.length})}catch(e){next(e)}});
const root=path.dirname(fileURLToPath(import.meta.url));if(prod){app.use(express.static(path.join(root,'dist'),{maxAge:'1h',index:false}));app.get('*',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(root,'dist','index.html')))}
app.use((err,_req,res,_next)=>{console.error('Northstar API error:',err.message);res.status(500).json({error:'The server could not complete that request.'})});
if(!process.env.MONGODB_URI)console.warn('MONGODB_URI is not set; MongoDB features will not start.');
mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/northstar').then(()=>app.listen(port,'0.0.0.0',()=>console.log(`Northstar listening on ${port}`))).catch(err=>{console.error('MongoDB connection failed:',err.message);process.exit(1)});
