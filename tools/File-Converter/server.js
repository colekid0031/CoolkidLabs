import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI from "openai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/health", (_req,res)=>res.json({ok:true,aiEnabled:Boolean(openai)}));

const TEXT_EXTS = new Set(["txt","md","html","htm","rtf","csv","tsv","json","xml","yaml","yml","sql","toml","ini","rst","adoc","org"]);
const OFFICE_EXTS = new Set(["docx","doc","odt","rtf","xlsx","xls","ods","pptx","ppt","odp","pdf"]);
const KNOWN_EXTS = new Set([...TEXT_EXTS,...OFFICE_EXTS,"epub"]);
const MIME = {
  txt:"text/plain; charset=utf-8",md:"text/markdown; charset=utf-8",html:"text/html; charset=utf-8",htm:"text/html; charset=utf-8",
  rtf:"application/rtf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc:"application/msword",odt:"application/vnd.oasis.opendocument.text",pdf:"application/pdf",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",
  ods:"application/vnd.oasis.opendocument.spreadsheet",csv:"text/csv; charset=utf-8",tsv:"text/tab-separated-values; charset=utf-8",
  json:"application/json; charset=utf-8",xml:"application/xml; charset=utf-8",yaml:"text/yaml; charset=utf-8",yml:"text/yaml; charset=utf-8",
  sql:"text/plain; charset=utf-8",toml:"text/plain; charset=utf-8",ini:"text/plain; charset=utf-8",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt:"application/vnd.ms-powerpoint",odp:"application/vnd.oasis.opendocument.presentation",epub:"application/epub+zip"
};
const extOf = (name) => path.extname(name).slice(1).toLowerCase();
const safeBase = (name) => path.basename(name, path.extname(name)).replace(/[^\p{L}\p{N}._ -]/gu,"_").slice(0,100) || "converted-file";
const exec = (command,args,options={}) => new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:["ignore","pipe","pipe"],...options});
  let stdout="",stderr="";
  child.stdout.on("data",d=>stdout+=d.toString());child.stderr.on("data",d=>stderr+=d.toString());
  child.on("error",reject);child.on("close",code=>code===0?resolve({stdout,stderr}):reject(new Error(stderr.trim()||`${command} exited with code ${code}`)));
});
async function existsCommand(command,args=["--version"]){try{await exec(command,args);return true;}catch{return false;}}
async function convertWithLibreOffice(inputPath, outputDir, target) {
  if (!(await existsCommand("soffice",["--version"]))) throw new Error("LibreOffice is not installed. Install it to convert office documents.");
  await exec("soffice",["--headless","--convert-to",target,"--outdir",outputDir,inputPath],{timeout:120000});
  const outputPath=path.join(outputDir,`${path.basename(inputPath,path.extname(inputPath))}.${target}`);
  try{await stat(outputPath);return outputPath;}catch{throw new Error(`LibreOffice could not produce .${target} from this file.`);}
}
async function convertWithPandoc(inputPath, outputDir, target) {
  if (!(await existsCommand("pandoc",["--version"]))) throw new Error("Pandoc is not installed. Install it to convert this text/publishing format.");
  const outputPath=path.join(outputDir,`${path.basename(inputPath,path.extname(inputPath))}.${target}`);
  await exec("pandoc",[inputPath,"-o",outputPath],{timeout:120000});
  await stat(outputPath);return outputPath;
}
async function readSourceText(buffer, ext, filePath) {
  if (TEXT_EXTS.has(ext)) {
    const text=buffer.toString("utf8");
    if(ext==="rtf") return text.replace(/\\par[d]?/g,"\n").replace(/\\'[0-9a-f]{2}/gi," ").replace(/\\[a-z]+-?\d* ?/gi,"").replace(/[{}]/g,"");
    return text;
  }
  if(ext==="docx") return (await mammoth.extractRawText({buffer})).value;
  if(ext==="pdf") return (await pdfParse(buffer)).text;
  if(["xlsx","xls","ods","csv","tsv"].includes(ext)){
    const workbook=XLSX.read(buffer,{type:"buffer"});
    return workbook.SheetNames.map(name=>`# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n");
  }
  if(["doc","odt","pptx","ppt","odp"].includes(ext)){
    const dir=path.dirname(filePath);
    const txtPath=await convertWithLibreOffice(filePath,dir,"txt");
    return await readFile(txtPath,"utf8");
  }
  if(ext==="epub"){
    const dir=path.dirname(filePath);
    const txtPath=await convertWithPandoc(filePath,dir,"txt");
    return await readFile(txtPath,"utf8");
  }
  throw new Error(`AI formatting cannot extract text from .${ext} in this starter. Try raw conversion instead.`);
}
function formatAsTarget(text, target) {
  if(target==="json"){
    try { return JSON.stringify(JSON.parse(text),null,2); }
    catch { return JSON.stringify({document:text},null,2); }
  }
  if(target==="html") return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Formatted document</title></head>\n<body>\n<main>\n${text.split(/\n{2,}/).map(p=>`<p>${escapeHtml(p).replace(/\n/g,"<br>")}</p>`).join("\n")}\n</main>\n</body>\n</html>`;
  if(target==="csv"||target==="tsv") return text;
  return text;
}
function escapeHtml(s){return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
async function aiFormat(text, target) {
  if(!openai) throw new Error("AI formatting is not configured. Add OPENAI_API_KEY to your .env file and restart the server.");
  if(text.length>80000) throw new Error("This document contains too much extracted text for this starter's AI formatting limit. Try a smaller file.");
  const response=await openai.responses.create({
    model:process.env.OPENAI_MODEL || "gpt-6-luna",
    instructions:"You are a careful document editor. Improve the formatting, structure, headings, spacing, grammar and readability of the provided document. Preserve its facts, names, numbers, intent, and meaning. Do not invent information. Return only the finished document content, with no commentary or code fences. Respect the requested output format.",
    input:`Requested output format: ${target}\n\nFormat this document cleanly for that format:\n\n${text}`
  });
  if(!response.output_text) throw new Error("The AI returned no formatted text.");
  return formatAsTarget(response.output_text,target);
}
async function rawConvert(buffer, originalName, sourceExt, targetExt, workDir) {
  const inputPath=path.join(workDir,`source.${sourceExt}`);
  await writeFile(inputPath,buffer);
  if(TEXT_EXTS.has(sourceExt) && TEXT_EXTS.has(targetExt)){
    const text=buffer.toString("utf8");
    if(sourceExt===targetExt) return {path:inputPath,filename:`${safeBase(originalName)}.${targetExt}`};
    // Data conversions with real structure handling.
    if(sourceExt==="json" && targetExt==="csv"){
      const data=JSON.parse(text);const rows=Array.isArray(data)?data:[data];const sheet=XLSX.utils.json_to_sheet(rows);const csv=XLSX.utils.sheet_to_csv(sheet);const out=path.join(workDir,`result.${targetExt}`);await writeFile(out,csv);return {path:out,filename:`${safeBase(originalName)}.${targetExt}`};
    }
    if(sourceExt==="csv" && targetExt==="json"){
      const wb=XLSX.read(text,{type:"string"});const data=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});const out=path.join(workDir,`result.${targetExt}`);await writeFile(out,JSON.stringify(data,null,2));return {path:out,filename:`${safeBase(originalName)}.${targetExt}`};
    }
    if(sourceExt==="tsv" && targetExt==="csv"){const out=path.join(workDir,`result.csv`);const wb=XLSX.read(text,{type:"string",FS:"\t"});await writeFile(out,XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));return {path:out,filename:`${safeBase(originalName)}.csv`};}
    if(sourceExt==="csv" && targetExt==="tsv"){const wb=XLSX.read(text,{type:"string"});const out=path.join(workDir,`result.tsv`);await writeFile(out,XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]],{FS:"\t"}));return {path:out,filename:`${safeBase(originalName)}.tsv`};}
    if(targetExt==="html"){const out=path.join(workDir,"result.html");await writeFile(out,formatAsTarget(text,"html"));return {path:out,filename:`${safeBase(originalName)}.html`};}
    if(targetExt==="json"){const out=path.join(workDir,"result.json");try{await writeFile(out,JSON.stringify(JSON.parse(text),null,2));}catch{await writeFile(out,JSON.stringify({document:text},null,2));}return {path:out,filename:`${safeBase(originalName)}.json`};}
    if(targetExt==="md"||targetExt==="txt"||targetExt==="yaml"||targetExt==="yml"||targetExt==="xml"||targetExt==="sql"||targetExt==="toml"||targetExt==="ini"||targetExt==="rst"||targetExt==="adoc"||targetExt==="org"){
      const out=path.join(workDir,`result.${targetExt}`);await writeFile(out,text);return {path:out,filename:`${safeBase(originalName)}.${targetExt}`};
    }
  }
  const officeTargets = new Set(["docx","doc","odt","rtf","pdf","xlsx","xls","ods","pptx","ppt","odp","html","txt"]);
  if(officeTargets.has(sourceExt)||officeTargets.has(targetExt)){
    const output=await convertWithLibreOffice(inputPath,workDir,targetExt);
    return {path:output,filename:`${safeBase(originalName)}.${targetExt}`};
  }
  return {path:await convertWithPandoc(inputPath,workDir,targetExt),filename:`${safeBase(originalName)}.${targetExt}`};
}

app.post("/api/convert",upload.single("file"),async(req,res)=>{
  let workDir;
  try{
    if(!req.file) return res.status(400).json({error:"Choose a file first."});
    const target=String(req.body.target||"").toLowerCase().replace(/^\./,"");
    const mode=String(req.body.mode||"raw");
    const source=extOf(req.file.originalname);
    if(!KNOWN_EXTS.has(source)) return res.status(415).json({error:`The .${source||"unknown"} format is not supported by this starter converter.`});
    if(!KNOWN_EXTS.has(target)) return res.status(400).json({error:`The .${target} output format is not supported by this starter converter.`});
    if(source===target) return res.status(400).json({error:"Choose a different output format from the original file."});
    workDir=await mkdtemp(path.join(os.tmpdir(),"neonforge-"));
    let outputPath,filename;
    if(mode==="format"){
      const inputPath=path.join(workDir,`source.${source}`);await writeFile(inputPath,req.file.buffer);
      const extracted=await readSourceText(req.file.buffer,source,inputPath);
      if (["xlsx","xls","ods","pptx","ppt","odp"].includes(target)) {
        throw new Error("AI formatting for spreadsheet and presentation output is not enabled in this starter. Use Raw conversion for these formats.");
      }
      const formatted=await aiFormat(extracted,target);
      filename=`${safeBase(req.file.originalname)}.${target}`;
      if (["docx","odt","rtf","pdf","epub"].includes(target)) {
        const markdownPath=path.join(workDir,"formatted.md");
        await writeFile(markdownPath,formatted,"utf8");
        outputPath=await convertWithPandoc(markdownPath,workDir,target);
      } else {
        outputPath=path.join(workDir,`result.${target}`);
        await writeFile(outputPath,formatted,"utf8");
      }
    } else {
      const result=await rawConvert(req.file.buffer,req.file.originalname,source,target,workDir);
      outputPath=result.path;filename=result.filename;
    }
    const output=await readFile(outputPath);
    res.setHeader("Content-Type",MIME[target]||"application/octet-stream");
    res.setHeader("Content-Disposition",`attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length",output.length);
    res.send(output);
  }catch(error){
    console.error("Conversion error:",error);
    res.status(500).json({error:error.message||"Conversion failed. Check that the required conversion engine is installed."});
  }finally{if(workDir) await rm(workDir,{recursive:true,force:true}).catch(()=>{});}
});
app.use((err,_req,res,_next)=>{
  if(err instanceof multer.MulterError && err.code==="LIMIT_FILE_SIZE") return res.status(413).json({error:`File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`});
  res.status(500).json({error:"Unexpected server error."});
});
app.listen(PORT,()=>console.log(`NeonForge is running at http://localhost:${PORT}`));
