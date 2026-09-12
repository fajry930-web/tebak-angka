const express=require("express"),path=require("path"),crypto=require("crypto"),bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken"),cookieParser=require("cookie-parser"),{Pool}=require("pg");
const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||crypto.randomBytes(32).toString("hex");
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD;
if(process.env.NODE_ENV==="production" && (!ADMIN_PASSWORD || ADMIN_PASSWORD==="admin123")) console.warn("WARNING: set a strong ADMIN_PASSWORD in production.");
if(process.env.NODE_ENV==="production" && !process.env.DATABASE_URL) console.warn("WARNING: DATABASE_URL is required in production.");

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false,max:10});
app.use(express.json({limit:"20kb"}));app.use(cookieParser());app.use(express.static(path.join(__dirname,"public")));

const defaults={
 easy_max:50,easy_lives:10,easy_time:60,easy_multiplier:1,
 medium_max:100,medium_lives:8,medium_time:50,medium_multiplier:2,
 hard_max:500,hard_lives:7,hard_time:40,hard_multiplier:4,
 game_title:"🎯 TEBAK ANGKA"
};
let dbReady=null;
async function init(){
 if(dbReady)return dbReady;
 dbReady=(async()=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS players(
    id SERIAL PRIMARY KEY,name VARCHAR(30) UNIQUE NOT NULL,password_hash TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,level INTEGER NOT NULL DEFAULT 1,xp INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS scores(
    id SERIAL PRIMARY KEY,player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    name VARCHAR(30) NOT NULL,score INTEGER NOT NULL,attempts INTEGER NOT NULL,
    difficulty VARCHAR(10) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS settings(key VARCHAR(50) PRIMARY KEY,value TEXT NOT NULL)`);
  for(const [k,v] of Object.entries(defaults))
    await pool.query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`,[k,String(v)]);
 })();
 return dbReady;
}
async function settings(){
 const r=await pool.query("SELECT key,value FROM settings");
 const out={...defaults};for(const x of r.rows)out[x.key]=x.value;return out;
}
function token(type,id){return jwt.sign({type,id},JWT_SECRET,{expiresIn:"7d"})}
function setAuth(res,t){res.cookie("auth",t,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000})}
function auth(type){
 return async(req,res,next)=>{
  try{
   const t=req.cookies.auth;if(!t)throw 0;const p=jwt.verify(t,JWT_SECRET);
   if(p.type!==type)throw 0;req.auth=p;next();
  }catch(e){res.status(401).json({error:"Belum login"});}
 }
}
function cleanName(v){return String(v||"").trim().replace(/\s+/g," ").slice(0,30)}
function validDifficulty(d){return ["easy","medium","hard"].includes(d)}

app.get("/health",async(req,res)=>{try{await init();await pool.query("SELECT 1");res.json({ok:true})}catch(e){res.status(503).json({ok:false})}});
app.get("/api/settings",async(req,res)=>{try{await init();res.json(await settings())}catch(e){res.status(500).json({error:"Database error"})}});

app.post("/api/auth/register",async(req,res)=>{
 try{
  await init();const name=cleanName(req.body.name),password=String(req.body.password||"");
  if(name.length<3)return res.status(400).json({error:"Nama minimal 3 karakter"});
  if(password.length<6)return res.status(400).json({error:"Password minimal 6 karakter"});
  const hash=await bcrypt.hash(password,12);
  const r=await pool.query("INSERT INTO players(name,password_hash) VALUES($1,$2) RETURNING id,name,coins,level,xp",[name,hash]);
  setAuth(res,token("player",r.rows[0].id));res.json(r.rows[0]);
 }catch(e){if(e.code==="23505")return res.status(409).json({error:"Nama sudah digunakan"});res.status(500).json({error:"Gagal membuat akun"})}
});
app.post("/api/auth/login",async(req,res)=>{
 try{
  await init();const name=cleanName(req.body.name),password=String(req.body.password||"");
  const r=await pool.query("SELECT id,name,password_hash,coins,level,xp FROM players WHERE name=$1",[name]);
  if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash)))return res.status(401).json({error:"Nama atau password salah"});
  const p=r.rows[0];setAuth(res,token("player",p.id));delete p.password_hash;res.json(p);
 }catch(e){res.status(500).json({error:"Gagal login"})}
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("auth");res.json({success:true})});
app.get("/api/me",auth("player"),async(req,res)=>{
 const r=await pool.query("SELECT id,name,coins,level,xp FROM players WHERE id=$1",[req.auth.id]);
 if(!r.rowCount)return res.status(401).json({error:"Akun tidak ditemukan"});res.json(r.rows[0]);
});

app.post("/api/game/start",auth("player"),async(req,res)=>{
 try{
  const s=await settings(),difficulty=String(req.body.difficulty||"medium");
  if(!validDifficulty(difficulty))return res.status(400).json({error:"Difficulty tidak valid"});
  const max=Number(s[`${difficulty}_max`]),lives=Number(s[`${difficulty}_lives`]),time=Number(s[`${difficulty}_time`]);
  if(!Number.isInteger(max)||max<2||!Number.isInteger(lives)||lives<1||!Number.isInteger(time)||time<5)return res.status(500).json({error:"Pengaturan game tidak valid"});
  const gameId=crypto.randomUUID(),secret=crypto.randomInt(1,max+1);
  const payload={gid:gameId,pid:req.auth.id,difficulty,max,lives,time,secret,startedAt:Date.now()};
  res.json({game:jwt.sign(payload,JWT_SECRET,{expiresIn:Math.max(time+30,60)+"s"}),max,lives,time});
 }catch(e){res.status(500).json({error:"Gagal memulai game"})}
});
app.post("/api/game/guess",auth("player"),async(req,res)=>{
 try{
  const p=jwt.verify(String(req.body.game||""),JWT_SECRET);
  if(p.pid!==req.auth.id)throw 0;
  const n=Number(req.body.number);
  if(!Number.isInteger(n)||n<1||n>p.max)return res.status(400).json({error:`Masukkan angka 1 sampai ${p.max}`});
  const attempts=Math.max(0,Number(req.body.attempts)||0)+1;
  if(Date.now()>p.startedAt+p.time*1000)return res.json({status:"timeout",attempts});
  if(n===p.secret){
   const s=await settings(),mul=Number(s[`${p.difficulty}_multiplier`])||1;
   const timeLeft=Math.max(0,Math.ceil((p.startedAt+p.time*1000-Date.now())/1000));
   const score=Math.max(10,(p.lives-attempts+1)*10*mul+timeLeft);
   const pr=await pool.query("SELECT id,name,coins,level,xp FROM players WHERE id=$1",[req.auth.id]);
   const player=pr.rows[0];let xp=player.xp+score,level=player.level,coins=player.coins+Math.floor(score/5);
   while(xp>=level*100){xp-=level*100;level++}
   await pool.query("UPDATE players SET xp=$1,level=$2,coins=$3 WHERE id=$4",[xp,level,coins,player.id]);
   await pool.query("INSERT INTO scores(player_id,name,score,attempts,difficulty) VALUES($1,$2,$3,$4,$5)",[player.id,player.name,score,attempts,p.difficulty]);
   return res.json({status:"win",attempts,score,level,xp,coins});
  }
  res.json({status:n<p.secret?"low":"high",attempts,remaining:Math.max(0,p.lives-attempts),finished:attempts>=p.lives});
 }catch(e){res.status(400).json({error:"Sesi game tidak valid atau sudah kedaluwarsa"})}
});
app.get("/api/leaderboard",async(req,res)=>{try{await init();res.json((await pool.query("SELECT id,name,score,attempts,difficulty,created_at FROM scores ORDER BY score DESC,id ASC LIMIT 20")).rows)}catch(e){res.status(500).json({error:"Database error"})}});

async function admin(req,res,next){
 try{
  if(!ADMIN_PASSWORD)return res.status(503).json({error:"ADMIN_PASSWORD belum disetel"});
  const t=req.cookies.admin;if(!t)throw 0;const p=jwt.verify(t,JWT_SECRET);
  if(p.type!=="admin")throw 0;next();
 }catch(e){res.status(401).json({error:"Admin belum login"})}
}
app.post("/api/admin/login",(req,res)=>{
 if(!ADMIN_PASSWORD||String(req.body.password||"")!==ADMIN_PASSWORD)return res.status(401).json({error:"Password admin salah"});
 res.cookie("admin",token("admin","root"),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000});
 res.json({success:true});
});
app.post("/api/admin/logout",(req,res)=>{res.clearCookie("admin");res.json({success:true})});
app.get("/api/admin/stats",admin,async(req,res)=>{const [p,s,m]=await Promise.all([pool.query("SELECT COUNT(*) c FROM players"),pool.query("SELECT COUNT(*) c FROM scores"),pool.query("SELECT COALESCE(MAX(score),0) m FROM scores")]);res.json({players:Number(p.rows[0].c),scores:Number(s.rows[0].c),top:Number(m.rows[0].m)})});
app.get("/api/admin/scores",admin,async(req,res)=>res.json((await pool.query("SELECT id,name,score,attempts,difficulty,created_at FROM scores ORDER BY id DESC LIMIT 500")).rows));
app.delete("/api/admin/scores/:id",admin,async(req,res)=>{await pool.query("DELETE FROM scores WHERE id=$1",[Number(req.params.id)]);res.json({success:true})});
app.delete("/api/admin/scores",admin,async(req,res)=>{await pool.query("DELETE FROM scores");res.json({success:true})});
app.post("/api/admin/settings",admin,async(req,res)=>{
 const d=req.body||{},allowed=Object.keys(defaults);
 for(const k of allowed)if(d[k]!==undefined)await pool.query("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[k,String(d[k])]);
 res.json(await settings());
});
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public/admin.html")));
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

init().then(()=>app.listen(PORT,()=>console.log(`Game online on port ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
