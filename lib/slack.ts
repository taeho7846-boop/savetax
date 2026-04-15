const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";

export async function sendSlackMessage(channel: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });
  return res.json();
}

export async function sendSlackReply(channel: string, threadTs: string, text: string) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, thread_ts: threadTs }),
  });
  return res.json();
}

export async function getSlackUserInfo(userId: string) {
  const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  return res.json();
}
