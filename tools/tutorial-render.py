"""Render annotated UI captures and Chinese WAV narration to a portrait MP4."""
import json, math, pathlib, subprocess, sys, wave
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=ROOT/'build/tutorial'
sys.path.insert(0,str(ROOT/'.toolchain/video-python'))
import imageio_ffmpeg

scenes=json.loads((WORK/'scenes.json').read_text(encoding='utf-8'))
fps=15
fonts={size:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',size) for size in [16,20,25,26,28,34]}
bold=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',34)
audio_parts=[]
for i,scene in enumerate(scenes):
    with wave.open(str(WORK/f'voice-{i}.wav'),'rb') as voice:
        params=voice.getparams()
        raw=voice.readframes(voice.getnframes())
    if i==0:audio_params=params
    assert params[:3]==audio_params[:3], 'Voice formats must match'
    scene['duration']=math.ceil(max(3.6,params.nframes/params.framerate+.5)*fps)/fps
    scene['frames_count']=round(scene['duration']*fps)
    target_samples=round(scene['duration']*params.framerate)
    audio_parts.append(raw+b'\0'*max(0,target_samples*params.nchannels*params.sampwidth-len(raw)))
with wave.open(str(WORK/'narration.wav'),'wb') as voice:
    voice.setparams(audio_params)
    voice.writeframes(b''.join(audio_parts))

width,height=720,1280
phone_x,phone_y,phone_w,phone_h=127,104,466,1010
mask=Image.new('L',(phone_w,phone_h),0)
ImageDraw.Draw(mask).rounded_rectangle((0,0,phone_w,phone_h),radius=14,fill=255)
frames={name:Image.open(WORK/name).convert('RGB').resize((phone_w,phone_h),Image.Resampling.LANCZOS)
        for scene in scenes for name in scene['frames']}
def lines(text,max_width,font):
    result=[];current=''
    for ch in text:
        if ch=='\n' or font.getlength(current+ch)>max_width:
            result.append(current);current='' if ch=='\n' else ch
        else:current+=ch
    if current:result.append(current)
    return result
def centered(draw,y,text,font,fill):
    draw.text(((width-font.getlength(text))/2,y),text,font=font,fill=fill)

out=ROOT/'dist/stride-tutorial-1.3.4.mp4'
command=[imageio_ffmpeg.get_ffmpeg_exe(),'-y','-hide_banner','-loglevel','error',
         '-f','rawvideo','-pix_fmt','rgb24','-s','720x1280','-r',str(fps),'-i','-',
         '-i',str(WORK/'narration.wav'),'-c:v','libx264','-preset','fast','-crf','20',
         '-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-shortest',str(out)]
process=subprocess.Popen(command,stdin=subprocess.PIPE)
total=sum(scene['frames_count'] for scene in scenes)
completed=0;time=0;srt=[]
def timestamp(seconds):
    milliseconds=round(seconds*1000)
    return f'{milliseconds//3600000:02}:{milliseconds//60000%60:02}:{milliseconds//1000%60:02},{milliseconds%1000:03}'
try:
    for index,scene in enumerate(scenes):
        start=time;time+=scene['duration']
        srt.append(f"{index+1}\n{timestamp(start)} --> {timestamp(time)}\n{scene['subtitle']}\n")
        for number in range(scene['frames_count']):
            frame_index=min(len(scene['frames'])-1,number*len(scene['frames'])//scene['frames_count'])
            image=Image.new('RGB',(width,height),'#101214')
            image.paste(frames[scene['frames'][frame_index]],(phone_x,phone_y),mask)
            draw=ImageDraw.Draw(image)
            draw.text((30,14),'STRIDE 行迹 · 使用教程',font=fonts[20],fill='#b9bfc4')
            draw.text((636,14),f'{index+1:02}/08',font=fonts[20],fill='#b9bfc4')
            centered(draw,46,scene['title'],bold,'#ffffff')
            if scene.get('settings'):
                box=Image.new('RGBA',(620,290),(20,22,24,245))
                box_draw=ImageDraw.Draw(box)
                box_draw.rounded_rectangle((0,0,619,289),radius=18,outline='#6e7479',width=2)
                box_draw.text((28,24),'在手机系统设置中完成',font=fonts[28],fill='white')
                for row,text in enumerate(['1  打开开发者选项','2  选择模拟位置信息应用','3  选择「行迹 STRIDE」']):
                    box_draw.text((28,88+row*53),text,font=fonts[25],fill='#e2e5e8')
                image.paste(box,(50,430),box)
                draw=ImageDraw.Draw(image)
            elif scene.get('targets'):
                target=scene['targets'][min(frame_index,len(scene['targets'])-1)]
                x=phone_x+target[0]*phone_w/393;y=phone_y+target[1]*phone_h/852
                phase=(number/fps)%(scene['duration']/len(scene['frames']))
                if phase<1.05:
                    radius=15+9*min(1,phase)
                    draw.ellipse((x-radius-2,y-radius-2,x+radius+2,y+radius+2),outline='#151515',width=5)
                    draw.ellipse((x-radius,y-radius,x+radius,y+radius),outline='white',width=3)
                    draw.ellipse((x-3,y-3,x+3,y+3),fill='white',outline='#151515',width=1)
            for row,line in enumerate(lines(scene['subtitle'],660,fonts[26])):
                centered(draw,1134+row*37,line,fonts[26],'#ffffff')
            centered(draw,1225,'界面操作演示 · 定位结果示例 · 系统权限需在手机授权',fonts[16],'#949da5')
            draw.rounded_rectangle((30,1260,690,1265),radius=2,fill='#353b40')
            draw.rounded_rectangle((30,1260,30+660*(completed+1)/total,1265),radius=2,fill='#f4f6f8')
            process.stdin.write(image.tobytes())
            completed+=1
    process.stdin.close()
    if process.wait()!=0:raise RuntimeError('MP4 encoding failed')
except BaseException:
    process.kill();raise
(ROOT/'dist/stride-tutorial-1.3.4.srt').write_text('\n'.join(srt),encoding='utf-8')
(WORK/'video.json').write_text(json.dumps({'durationSeconds':time,'frames':total,'size':[width,height],
    'voice':'Microsoft Huihui Desktop','subtitles':'burned in and SRT','file':str(out),
    'location':'illustrative fixture; not a recording of phone permission dialogs'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'file':str(out),'seconds':time,'bytes':out.stat().st_size},ensure_ascii=False))
