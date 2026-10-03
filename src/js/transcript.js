// transcript.js — collects the conversation and shows it as chat bubbles.
//
// voice.js will call add() from the SDK's message events. When the call
// ends, getMessages() gives the full list to send to /api/summary.

const SPEAKER_NAMES = { user: 'You', agent: 'Aria' };

// `listEl` = the <ol> for bubbles, `emptyEl` = the "will appear here" text.
export function createTranscript(listEl, emptyEl) {
  const messages = [];

  function createBubble({ role, text }) {
    const item = document.createElement('li');
    item.className = `bubble bubble-${role}`; // bubble-user (right) / bubble-agent (left)

    const speaker = document.createElement('span');
    speaker.className = 'bubble-speaker';
    speaker.textContent = SPEAKER_NAMES[role];

    const body = document.createElement('p');
    body.className = 'bubble-text';
    body.textContent = text; // textContent, never innerHTML: speech can't inject HTML

    item.append(speaker, body);
    return item;
  }

  return {
    // role: 'user' or 'agent'
    add(role, text) {
      const clean = String(text ?? '').trim();
      if (!clean) return; // ignore empty messages (e.g. silence)

      const message = { role, text: clean, at: new Date().toISOString() };
      messages.push(message);

      emptyEl.hidden = true;
      listEl.append(createBubble(message));
      listEl.scrollTop = listEl.scrollHeight; // keep the newest message in view
    },

    // Called when a new call starts.
    clear() {
      messages.length = 0;
      listEl.replaceChildren();
      emptyEl.hidden = false;
    },

    // A copy, so other code can't change our list by accident.
    getMessages() {
      return messages.map((m) => ({ ...m }));
    },
  };
}
