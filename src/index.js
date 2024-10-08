const { App, LogLevel } = require("@slack/bolt");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.DEBUG,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Predefined templates
const templates = {
  project_update:
    "Here's an update on our project: [PROJECT_NAME]. We've made significant progress on [MILESTONE]. Our next steps include [NEXT_STEPS]. Please let me know if you have any questions.",
  meeting_summary:
    "Thank you for attending our meeting about [TOPIC]. Key points discussed were: [POINT1], [POINT2], [POINT3]. Our action items are: [ACTION1], [ACTION2].",
  issue_notification:
    "We've encountered an issue with [ISSUE_DESCRIPTION]. Our team is actively working on a solution. We expect to resolve this by [ESTIMATED_RESOLUTION_TIME]. We appreciate your patience and understanding.",
};

// QA Checklists
const qaChecklists = {
  client_communication: [
    "Is the message clear and concise?",
    "Does it address all the client's concerns?",
    "Is the tone appropriate and professional?",
    "Are there any grammatical or spelling errors?",
    "Have you included all necessary information?",
  ],
  project_completion: [
    "Have all project requirements been met?",
    "Has the deliverable been thoroughly tested?",
    "Is the documentation complete and up-to-date?",
    "Have all known issues been resolved or documented?",
    "Has the client been notified of project completion?",
  ],
  technical_qa: [
    "Does the code follow our coding standards?",
    "Have all functions been properly documented?",
    "Have unit tests been written and passed?",
    "Has the code been reviewed by another team member?",
    "Have all debugging logs been removed?",
  ],
};

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
          value: command.channel_id, // Add this line to pass the channel ID
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

  const channelId = body.actions[0].value; // Retrieve the channel ID from the button value

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
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "message_options",
      private_metadata: channelId, // Use the retrieved channel ID
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
              options: messageOptions,
              action_id: "message_option_selected",
            },
          ],
        },
      ],
    },
  });
});

// Handle message option selection
app.action("message_option_selected", async ({ ack, body, client }) => {
  await ack();

  const selected = body.actions[0].selected_option.value;

  let blocks;
  switch (selected) {
    case "predefined":
      blocks = [
        {
          type: "input",
          block_id: "template_select",
          element: {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Select a template",
            },
            options: Object.keys(templates).map((key) => ({
              text: { type: "plain_text", text: key.replace("_", " ") },
              value: key,
            })),
            action_id: "template_selected",
          },
          label: {
            type: "plain_text",
            text: "Choose a template:",
          },
        },
      ];
      break;
    case "custom":
    case "revise":
      blocks = [
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
            text:
              selected === "custom"
                ? "Enter your message:"
                : "Enter the message to revise:",
          },
        },
      ];
      break;
  }

  await client.views.update({
    view_id: body.view.id,
    view: {
      type: "modal",
      callback_id: "generate_message",
      title: {
        type: "plain_text",
        text: "Generate Client Message",
      },
      blocks: blocks,
      submit: {
        type: "plain_text",
        text: "Generate",
      },
    },
  });
});

// Handle message generation
app.view("generate_message", async ({ ack, body, view, client }) => {
  await ack();

  let message = "";
  const templateBlock = view.state.values.template_select;
  const messageBlock = view.state.values.message_input;

  if (templateBlock) {
    const templateKey = templateBlock.template_selected.selected_option.value;
    message = templates[templateKey];
  } else if (messageBlock) {
    message = messageBlock.message_text.value;
  }

  const generatedMessage = await generateMessage(message);

  // Get the channel ID from the private_metadata
  const channelId = view.private_metadata;

  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: body.user.id,
      text: "Here's your generated message:",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: generatedMessage,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Edit",
              },
              action_id: "edit_message",
              value: generatedMessage, // Add this line to pass the generated message
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Approve",
              },
              style: "primary",
              action_id: "approve_message",
              value: generatedMessage, // Add this line to pass the generated message
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("Error posting ephemeral message:", error);
    // Handle the error appropriately, e.g., send a DM to the user
    await client.chat.postMessage({
      channel: body.user.id,
      text:
        "There was an error posting the message to the channel. Here's your generated message:\n\n" +
        generatedMessage,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: generatedMessage,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Edit",
              },
              action_id: "edit_message",
              value: generatedMessage,
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Approve",
              },
              style: "primary",
              action_id: "approve_message",
              value: generatedMessage,
            },
          ],
        },
      ],
    });
  }
});

// Handle the Review QA Checklist action
app.action("review_qa", async ({ ack, body, client }) => {
  await ack();

  const checklistOptions = Object.keys(qaChecklists).map((key) => ({
    text: {
      type: "plain_text",
      text: key.replace("_", " "),
    },
    value: key,
  }));

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "qa_checklist",
      title: {
        type: "plain_text",
        text: "Review QA Checklist",
      },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Choose a QA checklist to review:",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: "Select a checklist",
              },
              options: checklistOptions,
              action_id: "checklist_selected",
            },
          ],
        },
      ],
    },
  });
});

// Handle checklist selection
app.action("checklist_selected", async ({ ack, body, client }) => {
  await ack();

  const selected = body.actions[0].selected_option.value;
  const checklist = qaChecklists[selected];

  const blocks = checklist.map((item, index) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${index + 1}. ${item}`,
    },
    accessory: {
      type: "checkboxes",
      options: [
        {
          text: {
            type: "plain_text",
            text: "Completed",
          },
          value: `item_${index}`,
        },
      ],
      action_id: `checkbox_${index}`,
    },
  }));

  await client.views.update({
    view_id: body.view.id,
    view: {
      type: "modal",
      callback_id: "submit_qa",
      title: {
        type: "plain_text",
        text: "Review QA Checklist",
      },
      blocks: blocks,
      submit: {
        type: "plain_text",
        text: "Submit",
      },
    },
  });
});

// Handle QA checklist submission
app.view("submit_qa", async ({ ack, body, view, client }) => {
  await ack();

  const results = Object.values(view.state.values).map((item, index) => {
    const key = `checkbox_${index}`;
    return item[key].selected_options.length > 0;
  });

  const completedItems = results.filter(Boolean).length;
  const totalItems = results.length;

  await client.chat.postMessage({
    channel: body.user.id,
    text: `QA Checklist completed: ${completedItems}/${totalItems} items checked.`,
  });
});

// Generate message using GPT-4
async function generateMessage(prompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content:
          "You are a professional assistant helping to generate client communications. Ensure the message is clear, concise, and maintains a professional tone.",
      },
      {
        role: "user",
        content: `Please generate or refine the following client message: ${prompt}`,
      },
    ],
  });

  console.log("====================================");
  console.log(response.choices[0].message?.content);
  console.log("====================================");
  return response.choices[0].message?.content || "Unable to generate message";
}

// Add these new action handlers

// Handle the Edit action
app.action("edit_message", async ({ ack, body, client }) => {
  await ack();

  const message = body.actions[0].value;

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "edit_message_submit",
      title: {
        type: "plain_text",
        text: "Edit Message",
      },
      blocks: [
        {
          type: "input",
          block_id: "message_input",
          element: {
            type: "plain_text_input",
            action_id: "message_text",
            initial_value: message,
            multiline: true,
          },
          label: {
            type: "plain_text",
            text: "Edit your message:",
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

// Handle the Edit message submission
app.view("edit_message_submit", async ({ ack, body, view, client }) => {
  await ack();

  const editedMessage = view.state.values.message_input.message_text.value;
  const generatedMessage = await generateMessage(editedMessage);

  await client.chat.postMessage({
    channel: body.user.id,
    text: "Here's your edited message:",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: generatedMessage,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Edit",
            },
            action_id: "edit_message",
            value: generatedMessage,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Approve",
            },
            style: "primary",
            action_id: "approve_message",
            value: generatedMessage,
          },
        ],
      },
    ],
  });
});

// Handle the Approve action
app.action("approve_message", async ({ ack, body, client }) => {
  await ack();

  const approvedMessage = body.actions[0].value;

  await client.chat.postMessage({
    channel: body.channel.id,
    text: approvedMessage,
  });

  await client.chat.postEphemeral({
    channel: body.channel.id,
    user: body.user.id,
    text: "Your message has been approved and posted to the channel.",
  });
});

// Start the app
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log("⚡️ Bolt app is running js on port!", port);
})();
