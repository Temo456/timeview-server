const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '../../../.deploy-check/node_modules/playwright'),{spawn}=require('node:child_process'),{once}=require('node:events'),fs=require('node:fs');
const output=process.argv[2]||'deliverables/timeview-beijing-ascent-15s-v421-1080p.mp4',score=process.env.OPENING_SCORE||'.deploy-check/v420-media/ascent-score.wav',fps=60,seconds=15;
if(!fs.existsSync(score))throw new Error(`Opening score missing: ${score}. Run server/tools/opening/remix-city-intros.py first.`);
(async()=>{const browser=await chromium.launch({args:['--use-angle=gl','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8767/textures/beijing-flight/preview.html?render=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.flightReady,null,{timeout:60000});
 const proc=spawn('ffmpeg',['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-i',score,'-c:v','libx264','-preset','medium','-crf','21','-vf','scale=in_range=full:out_range=tv,format=yuv420p','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-g','120','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',String(seconds),output],{stdio:['pipe','ignore','pipe'],windowsHide:true});
 let log='';proc.stderr.on('data',d=>log+=d);const exited=once(proc,'close');
 for(let i=0;i<seconds*fps;i++){
  await page.evaluate(t=>renderFlight(t),i/fps);
  const frame=await page.screenshot({type:'jpeg',quality:95});if(!proc.stdin.write(frame))await once(proc.stdin,'drain');
  if(i%120===0)console.log(`Rendered ${i}/${seconds*fps} frames (${(i/fps).toFixed(1)}s)`,new Date().toISOString());
 }
 proc.stdin.end();const[code]=await exited;if(code!==0)throw new Error(log);if(errors.length)throw new Error(errors.join('\n'));console.log('COMPLETE',output,fs.statSync(output).size);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
