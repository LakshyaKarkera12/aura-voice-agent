// voice.js — the voice call: its state machine and the ElevenLabs session.
//
// SDK: @elevenlabs/client (see package.json for the version). Checked against
// its type definitions: clientTools may return only string/number, onMessage
// gives { message, role: 'user' | 'agent' }, onDisconnect gives
// { reason: 'user' | 'agent' | 'error' }.

// ---------- Call states ----------
// Each state has a label (shown under the orb, announced to screen readers)
// and a hint (one line telling the user what's happening / what to do).
export const CALL_STATES = {
  idle: {
    label: 'Ready',
    hint: 'Press Start call and say hello. Your browser will ask to use the microphone.',
  },
  connecting: {
    label: 'Connecting',
    hint: 'Connecting you to Aria…',
  },
  listening: {
    label: 'Listening',
    hint: 'Go ahead, Aria is listening.',
  },
  thinking: {
    label: 'Thinking',
    hint: 'Aria is working on an answer.',
  },
  speaking: {
    label: 'Speaking',
    hint: 'You can interrupt her at any time.',
  },
  ended: {
    label: 'Call ended',
    hint: 'Your transcript is below. Start a new call any time.',
  },
};

// States while a call is running (End call is available in these).
const ACTIVE = ['connecting', 'listening', 'thinking', 'speaking'];

// Which state can move to which. Why bother? Voice SDK events can arrive
// late or out of order, e.g. a "mode: listening" event just after the call
// disconnected. Without this check the orb could show "Listening" on a call
// that has ended.
const ALLOWED_NEXT = {
  idle: ['connecting'],
  connecting: ['listening', 'thinking', 'speaking', 'ended', 'idle'], // idle = failed to connect
  listening: ['thinking', 'speaking', 'ended'],
  thinking: ['listening', 'speaking', 'ended'],
  speaking: ['listening', 'thinking', 'ended'],
  ended: ['connecting'], // start a new call
};

export function isActiveState(state) {
  return ACTIVE.includes(state);
}

// Creates a state machine. `onChange(state, info)` runs after every change;
// app.js uses it to update the orb, labels and buttons.
export function createCallStateMachine(onChange = () => {}) {
  let current = 'idle';

  return {
    get state() {
      return current;
    },

    // Returns true if the change happened, false if it was ignored.
    setState(next) {
      if (next === current) return false; // nothing to do
      if (!ALLOWED_NEXT[current]?.includes(next)) {
        console.warn(`[call] ignored state change ${current} → ${next}`);
        return false;
      }
      current = next;
      onChange(next, CALL_STATES[next]);
      return true;
    },
  };
}

// ---------- The ElevenLabs session ----------

// Friendly messages for the alert box under the orb.
export const CALL_ERRORS = {
  micBlocked:
    'Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then press Start call again.',
  noMic: "We couldn't find a microphone. Plug one in (or check your headset) and try again.",
  connectFailed: "Couldn't connect to Aria. Check your internet connection and try again.",
  dropped: 'The call dropped unexpectedly. Your transcript so far is below.',
};

// Asks for the microphone BEFORE connecting, so a "blocked" answer gives a
// clear message instead of a vague connection error. We stop the test stream
// straight away; the SDK opens its own.
async function checkMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    if (error.name === 'NotFoundError') return CALL_ERRORS.noMic;
    return CALL_ERRORS.micBlocked; // NotAllowedError and anything else
  }
}

// Starts a call. Returns { stop() } straight away so End call works even
// while still connecting.
//   getConnection: async function returning { signedUrl } (or { agentId })
//   userName:   fills {{user_name}} in Aria's prompt and first message
//   machine:    the call state machine
//   transcript: where messages go
//   tools:      { get_order_details, cancel_order } from tools.js
//   onToolResult(name, result): lets app.js react (e.g. refresh Test Orders)
//   onError(message): shows a message under the orb
//   onLevels(input, output): mic and Aria's voice volume (0–1), ~60×/s, for the orb animation
export function startVoiceSession({ getConnection, userName, machine, transcript, tools, onToolResult, onError, onLevels }) {
  let conversation = null;
  let stopped = false; // End call pressed before we finished connecting
  let levelFrame = null;

  // Reads both volumes once per screen refresh while the call is live.
  function trackLevels() {
    if (!conversation) return;
    try {
      onLevels?.(conversation.getInputVolume(), conversation.getOutputVolume());
    } catch {
      return; // session already closed: stop the loop quietly
    }
    levelFrame = requestAnimationFrame(trackLevels);
  }

  function stopLevels() {
    cancelAnimationFrame(levelFrame);
    onLevels?.(0, 0);
  }

  // Wrap each tool: show "Thinking", run it, tell app.js, and return JSON text.
  // The SDK only accepts string/number results, so objects are stringified.
  const clientTools = {};
  for (const [name, run] of Object.entries(tools)) {
    clientTools[name] = async (parameters) => {
      machine.setState('thinking');
      const result = run(parameters ?? {});
      console.info(`[tool] ${name}`, parameters, '→', result); // handy when debugging calls
      onToolResult?.(name, result);
      return JSON.stringify(result);
    };
  }

  async function connect() {
    machine.setState('connecting');

    const micProblem = await checkMicrophone();
    if (micProblem) {
      machine.setState('idle');
      onError(micProblem);
      return;
    }
    if (stopped) return;

    try {
      // Load the SDK and fetch a signed URL at the same time (saves a moment).
      // The SDK is loaded on first use: keeps the page light and lets Node
      // tests import this file without a browser.
      const [{ Conversation }, connection] = await Promise.all([
        import('@elevenlabs/client'),
        getConnection(),
      ]);
      if (stopped) return;

      conversation = await Conversation.startSession({
        ...connection,
        connectionType: 'websocket',
        dynamicVariables: { user_name: userName }, // name must match the dashboard exactly
        clientTools,

        onConnect: () => machine.setState('listening'),

        // The SDK tells us only speaking/listening. "Thinking" is inferred:
        // after the user's message (below) or during a tool call (above).
        onModeChange: ({ mode }) => machine.setState(mode === 'speaking' ? 'speaking' : 'listening'),

        onMessage: ({ message, role }) => {
          transcript.add(role, message);
          if (role === 'user' && machine.state === 'listening') machine.setState('thinking');
        },

        onDisconnect: (details) => {
          // Logged so an unexpected hang-up can be diagnosed from the console.
          console.info('[voice] call ended by:', details.reason, details);
          stopLevels();
          if (details.reason === 'error') onError(CALL_ERRORS.dropped);
          machine.setState('ended'); // covers user, agent ("that's all") and errors
        },

        onError: (message, context) => console.error('[voice]', message, context),
      });

      // End call was pressed while we were connecting: hang up now.
      if (stopped) await conversation.endSession();
      else trackLevels();
    } catch (error) {
      console.error('[voice] could not start', error);
      if (!stopped) {
        machine.setState('idle');
        onError(CALL_ERRORS.connectFailed);
      }
    }
  }

  connect();

  return {
    async stop() {
      stopped = true;
      if (conversation) {
        await conversation.endSession(); // triggers onDisconnect → 'ended'
      } else {
        machine.setState('ended');
      }
    },
  };
}
