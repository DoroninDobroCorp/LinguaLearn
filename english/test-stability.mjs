import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001/api/live-chat');
const events = [];
await new Promise((r,j) => { ws.on('open', r); ws.on('error', j); });
await new Promise(r => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    events.push(msg);
    if (msg.type === 'session_ready') r();
  });
});
let turnCount = 0;
const done = new Promise(r => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'turn_complete') {
      turnCount++;
      if (turnCount === 1) {
        setTimeout(() => ws.send(JSON.stringify({ type: 'text', text: 'Yesterday I go to store.' })), 500);
      }
      if (turnCount >= 2) setTimeout(r, 3000);
    }
  });
  setTimeout(r, 25000);
});
await done;
ws.close();
const types = {};
for (const e of events) types[e.type] = (types[e.type]||0) + 1;
const result = {
  topic_changes: (types.topic_change||0),
  vocab_added: (types.vocab_added||0),
  exercise: (types.exercise||0),
  turn_completes: (types.turn_complete||0),
  errors: (types.error||0) + (types.session_ended||0),
  audio_chunks: (types.audio||0),
};
console.log(JSON.stringify(result));
process.exit(0);
