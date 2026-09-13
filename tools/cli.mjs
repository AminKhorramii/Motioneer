#!/usr/bin/env node
/** Small public entry point: terminal setup and the stdio agent share one npx package. */
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const help=`Motioneer ${pkg.version} — motion films from your product, through your agent.

  npx motioneer setup --claude     Install the renderer and connect this Claude Code project
  npx motioneer doctor             Check the model, renderer and workspace
  npx motioneer doctor --json      Machine-readable readiness; exit 1 if setup is incomplete
  npx motioneer mcp                Run the MCP server over stdio
  npx motioneer mcp-config         Print configuration for an MCP client
  npx motioneer [url|folder]       Open the local studio

Options: --dir <workspace>  --no-open  --port <1024–65535>  --help  --version
Setup also accepts --json. Without --claude, it leaves agent configuration unchanged.
Requires Node 20+ and signed-in Claude Code or a configured model provider.
`
try{
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Cannot start Motioneer: Node 20 or newer is required. Next: upgrade Node and retry.')
 const args=process.argv.slice(2)
 if(args.includes('--help')||args.includes('-h')){console.log(help);process.exit(0)}
 if(args.includes('--version')||args.includes('-v')){console.log(pkg.version);process.exit(0)}
 for(const option of ['--dir','--port']){const i=args.indexOf(option);if(i<0)continue;const value=args[i+1];if(!value||value.startsWith('--'))throw Error(`Cannot read ${option}. Next: provide its value.`);if(option==='--dir'){const {workspace}=await import('./environment.mjs');process.chdir(await workspace(value));process.env.MOTIONEER_WORKSPACE=process.cwd()}else{if(!/^\d+$/.test(value)||+value<1024||+value>65535)throw Error('Cannot use that port. Next: choose 1024–65535.');process.env.MOTIONEER_PORT=value}args.splice(i,2)}
 if(args.includes('--no-open')){process.env.MOTIONEER_NO_OPEN='1';args.splice(args.indexOf('--no-open'),1)}
 const command=args[0]
 if(command==='mcp'){if(args.length!==1)throw Error('Cannot start MCP with these arguments. Next: use npx motioneer mcp.');await import('../mcp/index.mjs')}
 else if(['doctor','setup','mcp-config'].includes(command)){
  if(args.slice(1).some(a=>!['--json',...(command==='setup'?['--claude']:[])].includes(a)))throw Error('Cannot read these options. Next: run npx motioneer --help.')
  const {diagnose,installRenderer,connectClaude,mcpConfig}=await import('./environment.mjs')
  if(command==='mcp-config')console.log(JSON.stringify(await mcpConfig(process.cwd()),null,2))
  else{
   let connection
   if(command==='setup'){await installRenderer(m=>console.error(m));if(args.includes('--claude'))connection=await connectClaude(process.cwd())}
   const report=await diagnose();if(connection)report.connection=connection
   if(args.includes('--json'))console.log(JSON.stringify(report,null,2))
   else{console.log(`Motioneer ${report.version}\n`);for(const c of report.checks)console.log(`${c.ok?'✓':'!'} ${c.id}: ${c.message}${c.next?'\n  '+c.next:''}`);if(connection)console.log(`\nConnected: ${connection.file}\nRestart Claude Code in this project and approve the Motioneer MCP server when prompted.`);if(report.ready)console.log('\nTry: “Make a 20-second snappy launch film from notion.so. Return video and editor links.”')}
   process.exitCode=report.ready?0:1
  }
 }else{
  const studioArgs=command==='studio'?args.slice(1):args
  const unknown=studioArgs.find(a=>a.startsWith('--')&&!['--app','--css'].includes(a));if(unknown)throw Error(`Cannot read option ${unknown}. Next: run npx motioneer --help.`)
  process.argv=[process.execPath,fileURLToPath(new URL('./studio.mjs',import.meta.url)),...studioArgs];await import('./studio.mjs')
 }
}catch(e){if(process.argv.includes('--json'))console.log(JSON.stringify({ready:false,error:e.message}));else console.error(e.message);process.exitCode=1}
