import {fetchOpenAI} from "~/server/services/openai";

const fetchOpenApiData = async (messages: Parameters<typeof fetchOpenAI>[0]["messages"], openaikey: string) => {
  if (!messages) {
    throw new Error('Empty message');
  }

  // Always append a specific system prompt
  const systemPrompt: { role: "system"; content: string } = {
    role: 'system',
    content: 'Your name is NLP-KG, which is the abbreviation for Natural Language Processing Knowledge Graph. You are a helpful assistant that can answer NLP-related questions and recommend research literature from a database of NLP papers. Your focus is on natural language processing specifically and not knowledge graphs.',
  };

  // add system prompt to the existing message
  messages.unshift(systemPrompt);
  const res = await fetch("/api/openAPI/openAPI", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_key: openaikey,
    },
    body: JSON.stringify({
      messages,
      max_tokens: 1000,
      model: "gpt-4-turbo-preview",
    }),
  });

  const data = await res.json();

  if (res.ok && data.choices && data.choices.length > 0) {
    return data.choices[0].message.content;
  } else {
    throw new Error('Unable to handle your request. Please log in and provide a valid OpenAI key in your profile to use this feature.');
  }
};

export default fetchOpenApiData;