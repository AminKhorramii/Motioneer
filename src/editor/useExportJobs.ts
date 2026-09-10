import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
export type ExportJob={id:string;state:string;message:string;done:number;total:number;url?:string;revision:number;name:string}
export function useExportJobs(id?:string){
  const [jobs,setJobs]=useState<ExportJob[]>([]),[error,setError]=useState('')
  const refresh=useCallback(async()=>{if(!id)return;try{setJobs(await api<ExportJob[]>(`projects/${id}/renders`));setError('')}catch(e){setError((e as Error).message)}},[id])
  useEffect(()=>{let live=true;setJobs([]);setError('');if(!id)return;const poll=async()=>{try{const jobs=await api<ExportJob[]>(`projects/${id}/renders`);if(live){setJobs(jobs);setError('')}}catch(e){if(live)setError((e as Error).message)}};void poll();const timer=setInterval(()=>void poll(),1500);return()=>{live=false;clearInterval(timer)}},[id])
  return {jobs,error,refresh}
}
