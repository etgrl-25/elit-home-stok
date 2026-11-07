export function normalizeAssistantEndpoint(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||!/^elit-home-assistant\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)||url.username||url.password||url.port)throw Error('Cloudflare’daki elit-home-assistant adresini girin (https://elit-home-assistant.…workers.dev).');
  return url.origin;
}
export function trimChatHistory(messages){
  const output=[];let size=0;
  for(const message of messages.slice(-16).reverse()){
    if(size+message.content.length>18000)break;
    size+=message.content.length;output.unshift(message);
  }
  return output;
}
export async function streamChat({endpoint,token,messages,stockContext='',quick=false,signal,onText}){
  const response=await fetch(normalizeAssistantEndpoint(endpoint)+'/api/chat',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({messages:trimChatHistory(messages),stockContext,quick}),signal});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Asistan bağlantısı yanıt vermedi.');}
  if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw Error('Sunucu sohbet yanıtı döndürmedi.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',finished=false;
  function consume(line){
    if(!line.startsWith('data:'))return;
    const data=line.slice(5).trim();if(!data)return;if(data==='[DONE]'){finished=true;return;}
    const event=JSON.parse(data);if(event.error)throw Error('Yapay zekâ yanıtı tamamlanamadı.');
    const choice=event.choices?.[0],delta=choice?.delta?.content;
    if(typeof delta==='string'){text+=delta;onText(text);}
    if(choice?.finish_reason){finished=true;if(choice.finish_reason==='length')onText(text+'\n\n[Yanıt sınırına ulaşıldı. Devam etmesini isteyebilirsin.]');}
  }
  try{
    while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});let newline;while((newline=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,newline).replace(/\r$/,''));buffer=buffer.slice(newline+1);}if(done){if(buffer.trim())consume(buffer.replace(/\r$/,''));break;}}
    if(!finished||!text.trim())throw Error('Yanıt kesildi veya boş geldi. Yeniden deneyin.');return text;
  }finally{await reader.cancel().catch(()=>{});}
}
