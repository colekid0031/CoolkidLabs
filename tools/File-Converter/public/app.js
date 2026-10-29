const $ = (selector) => document.querySelector(selector);

const formats = [
  {ext:"txt", name:"Text document", cat:"text", desc:"Plain text"},
  {ext:"md", name:"Markdown", cat:"text", desc:"Markdown file"},
  {ext:"html", name:"HTML", cat:"text", desc:"Web document"},
  {ext:"rtf", name:"Rich text", cat:"office", desc:"Rich Text Format"},
  {ext:"docx", name:"Word", cat:"office", desc:"Word document"},
  {ext:"odt", name:"OpenDocument", cat:"office", desc:"OpenDocument text"},
  {ext:"pdf", name:"PDF", cat:"office", desc:"Portable document"},
  {ext:"xlsx", name:"Excel", cat:"office", desc:"Spreadsheet workbook"},
  {ext:"ods", name:"Open spreadsheet", cat:"office", desc:"OpenDocument spreadsheet"},
  {ext:"csv", name:"CSV", cat:"data", desc:"Comma-separated data"},
  {ext:"tsv", name:"TSV", cat:"data", desc:"Tab-separated data"},
  {ext:"json", name:"JSON", cat:"data", desc:"Structured data"},
  {ext:"xml", name:"XML", cat:"data", desc:"Structured markup"},
  {ext:"yaml", name:"YAML", cat:"data", desc:"Structured data"},
  {ext:"sql", name:"SQL", cat:"data", desc:"Database script"},
  {ext:"toml", name:"TOML", cat:"data", desc:"Configuration data"},
  {ext:"ini", name:"INI", cat:"data", desc:"Configuration file"},
  {ext:"pptx", name:"PowerPoint", cat:"office", desc:"Presentation"},
  {ext:"odp", name:"Open presentation", cat:"office", desc:"OpenDocument presentation"},
  {ext:"epub", name:"EPUB", cat:"ebook", desc:"E-book"},
  {ext:"rst", name:"reStructuredText", cat:"text", desc:"Technical text"},
  {ext:"adoc", name:"AsciiDoc", cat:"text", desc:"Document markup"},
  {ext:"org", name:"Org Mode", cat:"text", desc:"Outline document"}
];
const textLike = new Set(["txt","md","html","rtf","csv","tsv","json","xml","yaml","yml","sql","toml","ini","rst","adoc","org"]);
const extensionDescriptions = {
  txt:"A text document",md:"A Markdown document",html:"An HTML document",rtf:"A rich-text document",docx:"A Microsoft Word document",doc:"A legacy Word document",odt:"An OpenDocument text document",pdf:"A portable document",xlsx:"An Excel spreadsheet",xls:"A legacy Excel spreadsheet",ods:"An OpenDocument spreadsheet",csv:"A comma-separated data file",tsv:"A tab-separated data file",json:"A JSON data file",xml:"An XML document",yaml:"A YAML data file",yml:"A YAML data file",sql:"A SQL script",toml:"A TOML configuration file",ini:"An INI configuration file",pptx:"A PowerPoint presentation",ppt:"A legacy PowerPoint presentation",odp:"An OpenDocument presentation",epub:"An EPUB e-book",rst:"A reStructuredText document",adoc:"An AsciiDoc document",org:"An Org Mode document"
};
const state = { file:null, sourceExt:"", targetExt:"", category:"all", search:"", busy:false, resultUrl:null };
const fileInput=$("#fileInput"), dropzone=$("#dropzone"), formatList=$("#formatList"), convertButton=$("#convertButton");

function extOf(name){ return (name.split(".").pop() || "").toLowerCase(); }
function formatLabel(ext){ return ext.toUpperCase(); }
function formatBytes(bytes){ if(bytes < 1024) return `${bytes} B`; if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`; return `${(bytes/1024/1024).toFixed(2)} MB`; }
function prettyName(name){ return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g," ").trim() || "converted-file"; }
function knownSource(ext){ return Boolean(extensionDescriptions[ext]) || ["doc","xls","ppt","pages","key","pub","mpp","tex","fodt","fods","fodp","xps","oxps","djvu","wpd","wps","numbers","sqlite","sqlite3","db","parquet","avro","ipynb","qmd","tex","ps","svg","png","jpg","jpeg","tif","tiff","webp","gif","bmp","heic","heif","avif","eps","slk","dif","123","gnumeric","accdb","mdb","kpf","mobi","azw","azw3","fb2","cbr","cbz","raw","cr2","cr3","nef"].includes(ext); }

async function setFile(file){
  if(!file) return;
  if(state.resultUrl){ URL.revokeObjectURL(state.resultUrl); state.resultUrl=null; }
  state.file=file; state.sourceExt=extOf(file.name); state.targetExt="";
  $("#selectedFile").classList.remove("hidden"); $("#sourceBadge").textContent=formatLabel(state.sourceExt).slice(0,7);
  $("#sourceName").textContent=file.name; $("#sourceInfo").textContent=`${extensionDescriptions[state.sourceExt] || "Detected file"} · ${formatBytes(file.size)}`;
  dropzone.classList.add("has-file");
  $("#targetHint").textContent=knownSource(state.sourceExt) ? "Choose a compatible output format." : "This file type is not supported by the starter converter.";
  $("#resultSection").classList.add("hidden"); clearMessage(); renderFormats(); updateConvertButton();
}
function clearFile(){
  state.file=null;state.sourceExt="";state.targetExt="";fileInput.value="";
  $("#selectedFile").classList.add("hidden");$("#targetHint").textContent="Upload a file to see compatible formats.";
  renderFormats();updateConvertButton();clearMessage();
}
function getTargets(){
  if(!state.file) return [];
  const src=state.sourceExt;
  // Conversion choices are intentionally conservative: backend tools determine the real route.
  const routeMap={
    txt:["md","html","pdf","docx","rtf","json","xml","csv","tsv","yaml","sql"],
    md:["txt","html","pdf","docx","odt","epub","rst","adoc"],
    html:["txt","md","pdf","docx","odt"],
    docx:["pdf","odt","rtf","txt","html","md"],
    doc:["pdf","docx","odt","rtf","txt"],
    odt:["docx","pdf","rtf","txt","html","md"],
    rtf:["docx","pdf","odt","txt","html"],
    pdf:["txt","docx","html","md","odt"],
    xlsx:["csv","tsv","ods","pdf","html"],
    xls:["xlsx","csv","tsv","ods","pdf"],
    ods:["xlsx","csv","tsv","pdf","html"],
    csv:["xlsx","ods","tsv","json","xml","txt","html","md"],
    tsv:["csv","xlsx","ods","json","xml","txt"],
    json:["txt","md","html","csv","xml","yaml"],
    xml:["txt","md","html","json","csv"],
    yaml:["json","xml","txt","md"],
    yml:["json","xml","txt","md"],
    sql:["txt","md","html"],
    toml:["json","yaml","txt","md"],
    ini:["json","yaml","txt","md"],
    pptx:["pdf","odp","ppt"],
    ppt:["pptx","pdf","odp"],
    odp:["pptx","pdf","ppt"],
    epub:["pdf","html","txt","docx","md"],
    rst:["md","html","pdf","docx","txt"],
    adoc:["html","pdf","docx","txt","md"],
    org:["txt","md","html","pdf","docx"]
  };
  let list=routeMap[src] || [];
  return formats.filter(f=>list.includes(f.ext) && f.ext!==src);
}
function renderFormats(){
  const targets=getTargets().filter(f=>(state.category==="all"||f.cat===state.category)&&(`${f.ext} ${f.name} ${f.desc}`).toLowerCase().includes(state.search));
  formatList.innerHTML="";
  if(!state.file){formatList.innerHTML='<div class="empty-formats">Your output formats will appear here after you add a file.</div>';return;}
  if(!targets.length){formatList.innerHTML='<div class="empty-formats">No compatible formats match this filter.</div>';return;}
  for(const f of targets){
    const button=document.createElement("button");button.type="button";button.className="format-button"+(state.targetExt===f.ext?" selected":"");
    button.setAttribute("aria-pressed",String(state.targetExt===f.ext));
    button.innerHTML=`<strong>${formatLabel(f.ext)}</strong><span>${f.name}</span>`;
    button.addEventListener("click",()=>{state.targetExt=f.ext;renderFormats();updateConvertButton();});formatList.appendChild(button);
  }
}
function updateConvertButton(){ convertButton.disabled=!state.file||!state.targetExt||state.busy; }
function clearMessage(){const el=$("#message");el.textContent="";el.className="message hidden";}
function showMessage(text,type="success"){const el=$("#message");el.textContent=text;el.className=`message ${type}`;}
function setProgress(percent,label){$("#progressWrap").classList.remove("hidden");$("#progressBar").style.width=`${percent}%`;$("#progressPercent").textContent=`${percent}%`;$("#progressLabel").textContent=label;}
function setBusy(value){state.busy=value;convertButton.disabled=value||!state.file||!state.targetExt;convertButton.querySelector("span:first-child").textContent=value?"Working on your file…":"Convert document";}

function renderResult(data){
  if(state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl=data.url;const ext=data.extension||state.targetExt;
  $("#resultSection").classList.remove("hidden");$("#resultName").textContent=data.filename;$("#resultDescription").textContent=extensionDescriptions[ext]||`${formatLabel(ext)} document`;
  $("#resultMeta").textContent=`${formatLabel(ext)} · ${data.size ? formatBytes(data.size) : "Ready to download"}`;
  $("#downloadLink").href=data.url;$("#downloadLink").download=data.filename;
  $("#resultArt").innerHTML=`<span class="art-fold"></span><strong>${formatLabel(ext).slice(0,6)}</strong><span class="art-lines"><i></i><i></i><i></i><i></i></span>`;
  $("#resultSection").scrollIntoView({behavior:"smooth",block:"center"});
}
async function convert(){
  if(!state.file||!state.targetExt||state.busy)return;
  clearMessage();setBusy(true);setProgress(12,"Uploading file to the conversion engine…");
  const form=new FormData();form.append("file",state.file);form.append("target",state.targetExt);form.append("mode",$("#formatMode").checked?"format":"raw");
  try{
    setProgress(35,$("#formatMode").checked?"Extracting text for AI formatting…":"Converting your document…");
    const response=await fetch("/api/convert",{method:"POST",body:form});
    setProgress(78,"Preparing your download…");
    const contentType=response.headers.get("content-type")||"";
    if(!response.ok||contentType.includes("application/json")){
      const err=await response.json().catch(()=>({error:"Conversion failed."}));throw new Error(err.error||"Conversion failed.");
    }
    const blob=await response.blob();const disposition=response.headers.get("content-disposition")||"";
    const match=disposition.match(/filename="?([^";]+)"?/i);
    const filename=match?decodeURIComponent(match[1]):`${prettyName(state.file.name)}.${state.targetExt}`;
    setProgress(100,"Complete");renderResult({url:URL.createObjectURL(blob),filename,extension:state.targetExt,size:blob.size});
    showMessage("Your converted file is ready to download.","success");
  }catch(error){showMessage(error.message||"Something went wrong while converting the file.","error");}
  finally{setBusy(false);setTimeout(()=>$("#progressWrap").classList.add("hidden"),900);}
}

$("#browseButton").addEventListener("click",(e)=>{e.stopPropagation();fileInput.click();});
dropzone.addEventListener("click",(e)=>{if(e.target.id!=="browseButton")fileInput.click();});
dropzone.addEventListener("keydown",(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fileInput.click();}});
fileInput.addEventListener("change",()=>setFile(fileInput.files[0]));
$("#removeFile").addEventListener("click",clearFile);
for(const eventName of ["dragenter","dragover"]){dropzone.addEventListener(eventName,e=>{e.preventDefault();dropzone.classList.add("dragover");});}
for(const eventName of ["dragleave","drop"]){dropzone.addEventListener(eventName,e=>{e.preventDefault();dropzone.classList.remove("dragover");});}
dropzone.addEventListener("drop",e=>setFile(e.dataTransfer.files[0]));
$("#formatSearch").addEventListener("input",e=>{state.search=e.target.value.toLowerCase().trim();renderFormats();});
$("#formatCategories").addEventListener("click",e=>{const button=e.target.closest("[data-category]");if(!button)return;state.category=button.dataset.category;document.querySelectorAll(".category").forEach(b=>b.classList.toggle("active",b===button));renderFormats();});
$("#formatMode").addEventListener("change",e=>{$("#aiNotice").classList.toggle("hidden",!e.target.checked);$("#modeDescription").textContent=e.target.checked?"AI formatting asks the configured model to improve the extracted text. It may change the wording and cannot reliably preserve complex layouts.":"Raw mode focuses on converting the file while preserving as much of its original structure as the converter supports.";});
convertButton.addEventListener("click",convert);
$("#themeSwitch").addEventListener("click",()=>{document.body.classList.toggle("light");const light=document.body.classList.contains("light");$("#themeIcon").textContent=light?"☼":"☾";$("#themeSwitch").setAttribute("aria-label",light?"Switch to dark theme":"Switch to light theme");localStorage.setItem("neonforge-theme",light?"light":"dark");});
if(localStorage.getItem("neonforge-theme")==="light"){document.body.classList.add("light");$("#themeIcon").textContent="☼";$("#themeSwitch").setAttribute("aria-label","Switch to dark theme");}
$("#year").textContent=new Date().getFullYear();
renderFormats();
