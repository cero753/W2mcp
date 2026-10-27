# ChatNoir security review

Mode: verify · coverage complete: false
Snapshot: `ac5aafbbb0601683935861c5311fb7d422cda47859183136f075ac5c275d3232`

Pattern matches are review leads. A zero-candidate baseline is not a clean bill of health.

## Executive summary

Agent&#45;permissions review of w2mcp &#40;anymcp&#41;&#44; a CLI and hub that generate MCP servers from API docs or OpenAPI specs&#46; The review was run by a fresh&#44; independent Claude Code 2&#46;1&#46;283 session &#40;claude&#45;opus&#45;5&#45;5&#41; with ChatNoir v0&#46;4&#46;1 installed as a project skill and loaded by name&#46; It confirmed three issues by source reading&#58; an API title that becomes code in every generated server&#44; tool output that could drive writes in the w2mcp ask loop without approval&#44; and a hub tool that could silently replace a trusted server&#46; Follow&#45;up work reproduced the first two at runtime with synthetic inputs and a scripted model&#46; Commit 340f83a fixes all three&#46; Both runtime reproductions now fail to trigger and legitimate behavior is preserved&#46; Two candidates remain unresolved&#46; Four were dismissed in the review&#44; two are recorded here&#46;

## Next actions

Recommendations only; exporting this report performs no changes or follow-up checks. Resolve the detailed proof gaps before closing an item.

| Finding / status | Recommended action and verification |
|---|---|
| W2MCP&#45;04 / needs&#95;review | Pin base&#95;url to the spec or docs origin&#44; or require confirmation when they differ&#46; Never forward a token to a host the user has not confirmed&#46; |
| W2MCP&#45;05 / needs&#95;review | Treat extraction output as untrusted&#46; Validate base&#95;url against the docs origin and show a diff before generating&#46; |

## W2MCP&#45;01: Untrusted API title becomes executable code in every generated server

fixed · high · src&#47;generate&#46;ts:117

Evidence:

- Found by a fresh&#44; independent Claude Code 2&#46;1&#46;283 session &#40;claude&#45;opus&#45;5&#45;5&#41; that loaded ChatNoir v0&#46;4&#46;1 by name&#46; It ran no target code&#46; Its only commands were read&#45;only&#58; git ls&#45;files&#44; rev&#45;parse and status&#44; a file listing&#44; and ChatNoir&#39;s own first&#45;review helper&#46;
- At 7672f5d&#44; generateServer spliced model&#46;api&#95;name unescaped into a block comment&#44; a double&#45;quoted string and a template literal of server&#46;ts&#46; model&#46;ts only checks that api&#95;name is a string&#46;
- openapi&#46;ts copies spec&#46;info&#46;title verbatim into api&#95;name&#46; The docs path takes it from LLM output&#46;
- Runtime reproduction &#40;test&#45;api&#45;name&#45;injection&#46;mjs&#41;&#58; a synthetic spec whose title closes the comment and calls process&#46;getBuiltinModule&#40;&#39;fs&#39;&#41;&#46;writeFileSync wrote the marker file when the generated server started under tsx&#44; as w2mcp starts servers&#46; The same test on 340f83a wrote nothing&#46;

Attack path:

- An attacker publishes or controls an OpenAPI spec &#40;or docs page&#41; with a crafted title
- A user or agent runs w2mcp import or new&#44; or calls the hub tool w2mcp&#95;&#95;create&#44; on that source
- generateServer writes the title into server&#46;ts as code
- The hub&#44; verify step or gateway starts the server with the full process environment&#44; and the payload runs

Validation (runtime): Before fix&#58; payload executed on server start &#40;marker written&#41;&#46; After fix 340f83a&#58; marker not written&#46; The calendar demo server regenerates byte&#45;identical &#40;169&#44;153 bytes&#41;&#44; so legitimate names are unchanged&#46;

Remediation: Pass api&#95;name through codeSafeName &#40;letters&#44; digits and a small punctuation set&#41; before splicing it into generated code&#46; Keep JSON&#46;stringify for every other spliced value&#46;

## W2MCP&#45;02: Tool output can drive state&#45;changing tool calls in w2mcp ask without approval

fixed · high · src&#47;use&#45;cli&#46;ts:253

Evidence:

- Found by the same fresh Claude Code session&#58; w2mcp ask feeds tool results back to the model as role&#58;tool messages and runs whatever call it proposes next&#44; including &#91;UNVERIFIED WRITE&#93; tools and w2mcp&#95;&#95;create&#46;
- Runtime reproduction &#40;test&#45;agent&#45;tool&#45;output&#46;mjs&#41;&#58; a local fake chat API returned a message instructing the assistant to archive &#35;general&#46; A scripted OpenAI&#45;compatible model obeys such text&#46; At 7672f5d the archive endpoint was hit 1 time&#46; On 340f83a it was hit 0 times&#44; while the legitimate read &#40;1&#41; and the final answer still happened&#46; With &#45;&#45;yes &#40;explicit human pre&#45;approval&#41; the archive ran once&#44; confirming the gate is what changed the outcome&#46;

Attack path:

- A tool&#39;s upstream API returns attacker&#45;controlled text
- w2mcp ask passes that text back to the model
- The model proposes a write or w2mcp&#95;&#95;create
- At 7672f5d the call ran with no human check

Validation (runtime): Scripted model&#44; synthetic local API&#58; 1 injected write before&#44; 0 after&#46; Legitimate read and answer preserved&#46; Real&#45;model susceptibility was not measured&#46;

Remediation: Require a human yes at the terminal for &#91;UNVERIFIED WRITE&#93; tools&#44; destructiveHint tools and w2mcp&#95;&#95;create&#46; Fail closed when stdin is not a TTY&#46; &#45;&#45;yes opts in explicitly&#46;

## W2MCP&#45;03: w2mcp&#95;&#95;create silently replaced an existing registered server

fixed · medium · src&#47;hub&#46;ts:108

Evidence:

- Found by the same fresh session&#58; createServerFromSource overwrote reg&#91;name&#93; and the live downstream connection with no existence check&#44; so any connected agent could swap a trusted server&#44; and the change persisted in registry&#46;json&#46;
- 340f83a throws before fetching the source when the name exists in the registry or among live downstream servers&#46;

Attack path:

- An agent connected to the hub &#40;possibly steered by injected text&#41; calls w2mcp&#95;&#95;create with the name of an existing server
- At 7672f5d the trusted server was replaced by one generated from the new source

Validation (static): Guard added before any fetch or write&#46; Confirmed by source reading only&#46; No runtime test was run because the hub module starts its transport on import&#46;

Remediation: Refuse to replace an existing name from a tool call&#46; Replacement stays an operator action &#40;edit registry&#46;json&#41;&#46;

## W2MCP&#45;04: Credential exposure through an attacker&#45;specified base&#95;url

needs&#95;review · medium · src&#47;openapi&#46;ts:129

Evidence:

- An attacker spec sets base&#95;url from servers&#91;0&#93;&#46;url&#44; and its title decides which &#42;&#95;TOKEN env var the server reads&#46;

Proof gaps:

- Needs proof that a matching token exists in the hub&#39;s environment in a real deployment&#46; The W2MCP&#45;01 and W2MCP&#45;03 fixes remove the code and replacement paths&#44; not an attacker&#45;chosen base&#95;url for a new name&#46;

Validation (static): Not reproduced&#46;

Remediation: Pin base&#95;url to the spec or docs origin&#44; or require confirmation when they differ&#46; Never forward a token to a host the user has not confirmed&#46;

## W2MCP&#45;05: Docs path may let injected page text shape the generated model

needs&#95;review · low · src&#47;extract&#46;ts:1

Evidence:

- w2mcp new &#60;url&#62; asks an LLM to extract api&#95;name&#44; base&#95;url and endpoints from page text an attacker may control&#46;

Proof gaps:

- Depends on a live model following injected text in the page&#46; Not tested&#46;

Validation (not_run): Not tested against a live model&#46;

Remediation: Treat extraction output as untrusted&#46; Validate base&#95;url against the docs origin and show a diff before generating&#46;

## W2MCP&#45;06: Path traversal through the create name

dismissed · info · src&#47;hub&#46;ts:110

Evidence:

- Candidate&#58; the name passed to w2mcp&#95;&#95;create becomes a directory under out&#47;&#46;

Counterevidence:

- The name is sanitized with &#91;&#94;&#92;w&#45;&#93;&#43; to &#39;&#45;&#39; before joining the path&#44; so separators and dots cannot traverse&#46;

Validation (static): Dismissed by source reading&#46;

Remediation: None&#46;

## W2MCP&#45;07: Code injection through endpoint names&#44; paths&#44; params&#44; headers&#44; error meanings or noise fields

dismissed · info · src&#47;generate&#46;ts:53

Evidence:

- Candidate&#58; other model fields are spliced into generated code too&#46;

Counterevidence:

- Every one of those values is emitted through JSON&#46;stringify&#44; tokenEnv is sanitized&#44; and error codes are validated as numbers in model&#46;ts&#46;

Validation (static): Dismissed by source reading&#46;

Remediation: None&#46;

## Coverage and limitations

Reviewed by this mode: 7 files. Deferred: 0. Skipped: 0.

- Scope&#58; the agent&#45;permissions focus of ChatNoir&#39;s guided first review&#46; Authentication of the hub HTTP mode and web&#47;server&#46;ts was noted as out of scope and not assessed&#46;
- Method&#58; a fresh headless Claude Code session did the source review&#46; It used Read&#44; Grep&#44; Glob&#44; the Skill tool and four read&#45;only PowerShell commands &#40;git metadata&#44; file listing&#44; ChatNoir first&#45;review&#41;&#46; No permission denials occurred&#46; Runtime reproductions and fixes were done afterwards in a separate session&#46;
- Runtime evidence uses synthetic local inputs and a scripted model&#46; It does not measure how often real models follow injected text&#46;
- Not read by the review session&#58; drift&#45;cli&#46;ts&#44; gen&#45;cli&#46;ts&#44; store&#46;ts&#44; clean&#46;ts&#44; render&#46;yaml&#44; fly&#46;toml&#46; No dependency or secret scanning&#46;
- The ChatNoir baseline scan returned 0 candidates on this TypeScript project&#46; Its agent rule families are Python AST rules&#44; so all findings came from the guided source review&#46;
