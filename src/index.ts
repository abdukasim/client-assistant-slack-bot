import {
  App,
  LogLevel,
  ButtonAction,
  ExpressReceiver,
  SlackAction,
} from "@slack/bolt";
import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import util from "util";

dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.DEBUG,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Handle the /client-assistant command
app.command("/client-assistant", async ({ command, ack, respond }) => {
  await ack();

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Welcome to the Client Assistant Bot! What would you like to do?",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Generate Client Message",
          },
          action_id: "generate_message",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Review QA Checklist",
          },
          action_id: "review_qa",
        },
      ],
    },
  ];

  await respond({ blocks });
});

// Handle the Generate Client Message action
app.action("generate_message", async ({ ack, body, client }) => {
  await ack();

  const messageOptions = [
    {
      text: {
        type: "plain_text",
        text: "Predefined Templates",
      },
      value: "predefined",
    },
    {
      text: {
        type: "plain_text",
        text: "Custom Message",
      },
      value: "custom",
    },
    {
      text: {
        type: "plain_text",
        text: "Revise Message",
      },
      value: "revise",
    },
  ];
  await client.views.open({
    trigger_id: (body as any).trigger_id,
    view: {
      type: "modal",
      callback_id: "message_options",
      title: {
        type: "plain_text",
        text: "Generate Client Message",
      },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Choose a message generation option:",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Select an option",
              },
              options: messageOptions.map((option) => ({
                text: {
                  type: "plain_text",
                  text: option.text.text,
                },
                value: option.value,
              })),
              action_id: "message_option_selected",
            },
          ],
        },
      ],
    },
  });
});

// Handle the Review QA Checklist action
app.action("review_qa", async ({ ack, body, client }) => {
  await ack();

  // Implement QA checklist logic here
});

// Generate message using GPT-4
async function generateMessage(prompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message?.content || "Unable to generate message";
}
// Add a global error handler to catch any errors
app.error(async (error) => {
  console.error("An error occurred:", error);
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);

  console.log(`⚡️ Bolt app is running on port ${port}!`);
})();
