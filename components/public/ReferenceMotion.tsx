'use client';
import {useEffect} from 'react';

/** Cursor lighting and perspective follow the reference; touch retains a still surface. */
export default function ReferenceMotion({paused=false}:{paused?:boolean}){
 useEffect(()=>{
  if(paused||matchMedia('(prefers-reduced-motion: reduce)').matches||!matchMedia('(pointer:fine)').matches)return;
  const root=document.querySelector('.jn-site');if(!root)return;
  let previous:HTMLElement|null=null,frame=0,latest:PointerEvent|null=null;
  const reset=()=>{if(previous){previous.style.setProperty('--jn-tilt-x','0deg');previous.style.setProperty('--jn-tilt-y','0deg');previous.classList.remove('jn-pointer-active');previous=null;}};
  const draw=()=>{frame=0;const e=latest;if(!e)return;const target=(e.target as Element).closest<HTMLElement>('.jn-image-window,.jn-amenity,.jn-building>div');if(!target){reset();return;}const r=target.getBoundingClientRect();if(previous!==target)reset();previous=target;target.style.setProperty('--jn-pointer-x',`${e.clientX-r.left}px`);target.style.setProperty('--jn-pointer-y',`${e.clientY-r.top}px`);target.style.setProperty('--jn-tilt-x',`${(e.clientY-r.top-r.height/2)/r.height*-4}deg`);target.style.setProperty('--jn-tilt-y',`${(e.clientX-r.left-r.width/2)/r.width*4}deg`);target.classList.add('jn-pointer-active');};
  const move=(event:Event)=>{latest=event as PointerEvent;if(!frame)frame=requestAnimationFrame(draw);};
  const leave=()=>{cancelAnimationFrame(frame);frame=0;latest=null;reset();};
  root.addEventListener('pointermove',move,{passive:true});root.addEventListener('pointerleave',leave);return()=>{leave();root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',leave);};
 },[paused]);
 return null;
}
