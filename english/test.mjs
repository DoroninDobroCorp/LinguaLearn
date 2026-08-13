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
await new Promise(r => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'turn_complete') {
      turnCount++;
      console.log('turn #' + turnCount);
      if (turnCount === 1) setTimeout(() => ws.send(JSON.stringify({ type: 'text', text: 'Yesterday I go to store.' })), 500);
      if (turnCount >= 2) setTimeout(r, 4000);
    }
  });
  setTimeout(r, 30000);
});
ws.close();
console.log('events:', JSON.stringify(Object.keys(events.reduce((a,e)=>{a[e.type]=1;return a;},{}))));
console.log('topic_changes:', events.filter(e=>e.type==='topic_change').length);
console.log('vocab:', events.filter(e=>e.type==='vocab_added').length);
console.log('errors:', events.filter(e=>e.type==='error' || e.type==='session_ended').length);
process.exit(0);
