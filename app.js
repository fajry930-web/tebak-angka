let mode="login",game=null,attempts=0,timer=null,timeLeft=0;
const $=id=>document.getElementById(id);
$("tabLogin").onclick=()=>{mode="login";toggleTabs()};
$("tabReg").onclick=()=>{mode="register";toggleTabs()};
$("authBtn").onclick=auth;
$("pass").onkeydown=e=>e.key==="Enter"&&auth();
$("start").onclick=start;
$("guess").onclick=guess;
$("input").onkeydown=e=>e.key==="Enter"&&guess();
$("new").onclick=setup;
$("logout").onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});location.reload()};
function toggleTabs(){$("tabLogin").classList.toggle("active",mode==="login");$("tabReg").classList.toggle("active",mode==="register");$("authBtn").textContent=mode==="login"?"Masuk":"Buat Akun"}
async function auth(){const name=$("name").value.trim(),password=$("pass").value;if(!name||!password)return msgAuth("Isi nama dan password.");const r=await fetch("/api/auth/"+mode,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,password})}),d=await r.json();if(!r.ok)return msgAuth(d.error||"Gagal");showPlayer(d)}
async function boot(){const r=await fetch("/api/me");if(r.ok)showPlayer(await r.json());board()}
function showPlayer(p){$("auth").classList.add("hide");$("setup").classList.remove("hide");$("pname").textContent=p.name;$("level").textContent=p.level;$("coins").textContent=p.coins}
function msgAuth(t){$("authMsg").textContent=t}
async function start(){const difficulty=$("difficulty").value;const r=await fetch("/api/game/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({difficulty})}),d=await r.json();if(!r.ok)return alert(d.error);game=d.game;attempts=0;timeLeft=d.time;$("range").textContent=`1–${d.max}`;$("lives").textContent=d.lives;$("score").textContent=0;$("history").innerHTML="";$("msg").textContent="Ayo tebak!";$("setup").classList.add("hide");$("game").classList.remove("hide");clearInterval(timer);timer=setInterval(()=>{timeLeft--;$("timer").textContent=timeLeft+"s";if(timeLeft<=0){clearInterval(timer);end("⏰ Waktu habis.");}},1000);$("timer").textContent=timeLeft+"s";$("input").disabled=false;$("guess").disabled=false;$("input").focus()}
async function guess(){if(!game)return;const n=Number($("input").value);if(!Number.isInteger(n))return;$("input").value="";const r=await fetch("/api/game/guess",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game,number:n,attempts})}),d=await r.json();if(!r.ok)return end("Sesi game tidak valid. Silakan mulai lagi.");attempts=d.attempts;$("history").innerHTML+=`<span class="chip">${n}</span>`;if(d.status==="win"){ $("score").textContent=d.score;$("level").textContent=d.level;$("coins").textContent=d.coins;end(`🎉 BENAR! +${d.score} poin.`);board();return}if(d.status==="timeout")return end("⏰ Waktu habis.");$("lives").textContent=d.remaining;if(d.finished)return end("😅 Kesempatan habis.");$("msg").textContent=d.status==="low"?"⬆️ Terlalu kecil!":"⬇️ Terlalu besar!";$("input").focus()}
function end(t){clearInterval(timer);$("msg").textContent=t;$("input").disabled=true;$("guess").disabled=true;game=null}
function setup(){clearInterval(timer);game=null;$("game").classList.add("hide");$("setup").classList.remove("hide")}
async function board(){const r=await fetch("/api/leaderboard");if(!r.ok)return;$("board").innerHTML=(await r.json()).map((x,i)=>`<div class="rank"><b>${i+1}</b><div><strong>${esc(x.name)}</strong><br><small>${x.difficulty} · ${x.attempts} tebakan</small></div><strong>${x.score}</strong></div>`).join("")||"<p>Belum ada skor.</p>"}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
boot();