import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { END, START, StateGraph } from '@langchain/langgraph';
import { MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { ChatOpenAI } from '@langchain/openai';
import { invokeWithRetry, withoutThinking } from './agent.model.js';

function hasToolCalls(message: BaseMessage): boolean {
  return message instanceof AIMessage && (message.tool_calls?.length ?? 0) > 0;
}

function textOf(message: BaseMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .map((part) => (typeof part === 'string' ? part : 'text' in part ? String(part.text) : ''))
    .join('');
}

/**
 * A reply with no text and no tool call is a dead end for the user. Free
 * OpenRouter models return one occasionally on an otherwise successful call,
 * and a reasoning model can return thinking with no answer, so it is treated
 * as a failure and retried rather than surfaced as an answer.
 */
function isEmptyReply(message: BaseMessage): boolean {
  return withoutThinking(textOf(message)).length === 0 && !hasToolCalls(message);
}

/**
 * agent -> (tool calls?) -> tools -> agent -> ... -> END
 *
 * The graph is built per turn because the tool set depends on which
 * integrations the current user has connected.
 */
export function buildAgentGraph(tools: StructuredToolInterface[], chatModel: ChatOpenAI) {
  const boundModel = tools.length > 0 ? chatModel.bindTools(tools) : chatModel;

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', async (state) => {
      const response = await invokeWithRetry(async () => {
        const message = await boundModel.invoke(state.messages);
        if (isEmptyReply(message)) {
          throw new Error('Model returned an empty response');
        }
        return message;
      });
      return { messages: [response] };
    })
    .addNode('tools', new ToolNode(tools))
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (state) => {
      const last = state.messages.at(-1);
      return last && hasToolCalls(last) ? 'tools' : END;
    })
    .addEdge('tools', 'agent');

  return graph.compile();
}
