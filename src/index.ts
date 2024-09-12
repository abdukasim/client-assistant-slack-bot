import { App, LogLevel, ButtonAction, ExpressReceiver } from "@slack/bolt";
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

// Predefined message templates
const messageTemplates: { [key: string]: string } = {
  greeting: "Hello! How can I assist you today?",
  followUp:
    "I wanted to follow up on our previous conversation. Do you have any questions?",
  // Add more templates as needed
};

// QA Checklists
const qaChecklists = {
  general: [
    "Is the message clear and concise?",
    "Does it align with our brand voice?",
    "Are there any spelling or grammatical errors?",
  ],
  // Add more checklists as needed
};

// Add more logging to the /assistant command
console.log("Setting up /assistant command handler");
app.command("/assistant", async ({ command, ack, say, logger }) => {
  console.log("Received /assistant command:", command);
  await ack();
  logger.info("Acknowledged /assistant command");
  await say("Processing your request...");
  logger.info("Sent initial response");
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "How would you like to create your message?",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Use Template",
            },
            action_id: "use_template",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Custom Message",
            },
            action_id: "custom_message",
          },
        ],
      },
    ],
  });
});

app.action("use_template", async ({ body, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: (body as any).trigger_id,
    view: {
      type: "modal",
      callback_id: "template_selection",
      private_metadata: body?.channel?.id, // Add this line to pass the channel ID
      title: {
        type: "plain_text",
        text: "Select a Template",
      },
      blocks: [
        {
          type: "input",
          block_id: "template_select",
          element: {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Select a template",
            },
            options: Object.entries(messageTemplates).map(([key, value]) => ({
              text: {
                type: "plain_text",
                text: key,
              },
              value: key,
            })),
            action_id: "template_choice",
          },
          label: {
            type: "plain_text",
            text: "Choose a message template",
          },
        },
      ],
      submit: {
        type: "plain_text",
        text: "Submit",
      },
    },
  });
});

app.view("template_selection", async ({ ack, body, view, client }) => {
  await ack();
  const selectedTemplate =
    view.state.values.template_select.template_choice.selected_option?.value;
  const message = selectedTemplate ? messageTemplates[selectedTemplate] : "";

  // Get the channel ID from the body
  const channelId = body.view.private_metadata;

  await client.chat.postMessage({
    channel: channelId, // Use the channel ID instead of body.user.id
    text: `Here's your selected template:\n\n${message}\n\nWould you like to revise this message?`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Here's your selected template:\n\n${message}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Revise",
            },
            action_id: "revise_message",
            value: message,
          },
        ],
      },
    ],
  });
});

app.action("custom_message", async ({ body, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: (body as any).trigger_id,
    view: {
      type: "modal",
      callback_id: "custom_message_submission",
      private_metadata: (body as any).channel.id, // Add this line to pass the channel ID
      title: {
        type: "plain_text",
        text: "Create Custom Message",
      },
      blocks: [
        {
          type: "input",
          block_id: "message_input",
          element: {
            type: "plain_text_input",
            action_id: "message_text",
            multiline: true,
          },
          label: {
            type: "plain_text",
            text: "Enter your message",
          },
        },
      ],
      submit: {
        type: "plain_text",
        text: "Submit",
      },
    },
  });
});

app.view("custom_message_submission", async ({ ack, body, view, client }) => {
  await ack();
  const message = view.state.values.message_input.message_text.value;
  const channelId = body.view.private_metadata; // Get the channel ID from private_metadata
  if (message) {
    await client.chat.postMessage({
      channel: channelId, // Use channelId instead of body.user.id
      text: `Here's your custom message:\n\n${message}\n\nWould you like to revise this message?`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Here's your custom message:\n\n${message}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Revise",
              },
              action_id: "revise_message",
              value: message,
            },
          ],
        },
      ],
    });
  }
});

app.action("revise_message", async ({ body, ack, client, action }) => {
  await ack();
  const message = (action as ButtonAction).value;
  const channelId = (body as any).channel.id; // Get the channel ID from the body
  if (message) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that revises messages to align with professional communication standards.",
          },
          {
            role: "user",
            content: `Please revise the following message to make it more professional and aligned with brand standards: "${message}"`,
          },
        ],
      });

      const revisedMessage = completion.choices[0]?.message?.content;
      console.log("====================================");
      console.log({ revisedMessage });
      console.log("====================================");

      if (revisedMessage) {
        await client.chat.postMessage({
          channel: channelId, // Use channelId instead of (body as any).user.id
          text: `Here's the revised message:\n\n${revisedMessage}\n\nWould you like to apply a QA checklist?`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Here's the revised message:\n\n${revisedMessage}`,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Apply QA Checklist",
                  },
                  action_id: "apply_qa_checklist",
                  value: revisedMessage,
                },
              ],
            },
          ],
        });
      }
    } catch (error) {
      console.log("====================================");
      console.log({ error });
      console.log("====================================");
      console.error("Error revising message:", error);
      await client.chat.postMessage({
        channel: channelId, // Use channelId instead of (body as any).user.id
        text: "Sorry, there was an error revising your message. Please try again.",
      });
    }
  }
});

app.action("apply_qa_checklist", async ({ body, ack, client, action }) => {
  await ack();
  const message = (action as ButtonAction).value;
  if (message) {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: "modal",
        callback_id: "qa_checklist_review",
        private_metadata: (body as any).channel.id, // Add this line to pass the channel ID
        title: {
          type: "plain_text",
          text: "QA Checklist Review",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Message to review:*\n\n${message}`,
            },
          },
          ...qaChecklists.general.map((item, index) => ({
            type: "input",
            block_id: `qa_item_${index}`,
            element: {
              type: "checkboxes",
              options: [
                {
                  text: {
                    type: "mrkdwn",
                    text: item,
                  },
                  value: `qa_${index}`,
                },
              ],
              action_id: `qa_check_${index}`,
            },
            label: {
              type: "plain_text",
              text: " ",
            },
          })),
        ],
        submit: {
          type: "plain_text",
          text: "Finalize",
        },
      },
    });
  }
});

app.view("qa_checklist_review", async ({ ack, body, view, client }) => {
  await ack();
  const channelId = body.view.private_metadata; // Get the channel ID from private_metadata
  const checkedItems = Object.values(view.state.values).filter((block) => {
    const firstValue = Object.values(block)[0] as any;
    return (
      firstValue?.type === "checkboxes" &&
      firstValue?.selected_options?.length > 0
    );
  }).length;

  await client.chat.postMessage({
    channel: channelId, // Use channelId instead of body.user.id
    text: `QA Checklist completed. ${checkedItems}/${qaChecklists.general.length} items checked. Your message is ready to be sent.`,
  });
});

// Add a catch-all listener for unhandled events
app.message(async ({ message, logger }) => {
  logger.info("Received unhandled message:", message);
});

app.message("hello", async ({ message, say }) => {
  console.log("Received message:", message);
  if ("user" in message) {
    try {
      await say(`Hey there <@${message.user}>!`);
      console.log("Sent response to 'hello' message");
    } catch (error) {
      console.error("Error sending response:", error);
    }
  }
});

// Add a global error handler to catch any errors
app.error(async (error) => {
  console.error("An error occurred:", error);
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);

  console.log(`⚡️ Bolt app is running on port ${port}!`);
})();
