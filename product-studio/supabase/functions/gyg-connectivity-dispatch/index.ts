import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

// Authenticated back-to-back call: Vercel gateway validates GetYourGuide Basic Auth;
// this internal function separately authenticates our Studio server-to-server key.
const EXPECTED_KEY_HASH = "b2b8549ac3057c08b54fee1f6748536e5dbca77047012d6a64817a6b4319a2c3";
const OPS = new Set(["get-availabilities","reserve","cancel-reservation","book","cancel-booking"]);
function json(value: unknown, status=200) {
  return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
async function sha256(value:string) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async req=>{
  if(req.method!=="POST") return json({errorCode:"INVALID_REQUEST",errorMessage:"Method not supported."},405);
  const supplied=req.headers.get("x-studio-key")||"";
  if(!supplied || (await sha256(supplied))!==EXPECTED_KEY_HASH)
    return json({errorCode:"UNAUTHORIZED",errorMessage:"Unauthorized."},401);
  try{
    const incoming=await req.json();
    const op=typeof incoming?.operation==="string" ? incoming.operation : "";
    if(!OPS.has(op))return json({errorCode:"INVALID_REQUEST",errorMessage:"Unsupported operation."},400);
    const payload=incoming.params;
    if(!payload||typeof payload!=="object"||Array.isArray(payload))return json({errorCode:"INVALID_REQUEST",errorMessage:"JSON object required."},400);
    const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    const secret=keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const url=Deno.env.get("SUPABASE_URL");
    if(!url||!secret)throw new Error("Storage configuration unavailable");
    const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.rpc("gyg_sandbox_dispatch",{p_operation:op,p_payload:payload});
    if(error){
      console.error("GetYourGuide ledger returned database error",error.code||"unknown");
      return json({errorCode:"SYSTEM_FAILURE",errorMessage:"Reservation service unavailable."},503);
    }
    return json(data??{errorCode:"SYSTEM_FAILURE",errorMessage:"Empty response."},data?200:503);
  }catch(error){
    console.error("GetYourGuide internal dispatch failure",error?.name||"internal");
    return json({errorCode:"SYSTEM_FAILURE",errorMessage:"Reservation service unavailable."},503);
  }
});
