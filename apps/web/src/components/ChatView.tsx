/**
 * ChatView — placeholder for the message area.
 *
 * Will be fully implemented in 1C.9. For now, renders a scrollable
 * area showing the current messages list or an empty-state prompt.
 */

import { useStore } from "@/store";

export function ChatView() {
	const messages = useStore((s) => s.messages);

	if (messages.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<p className="text-neutral-500">Send a message to start a conversation with Pi</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
			{messages.map((msg) => (
				<div key={msg.id} className="mb-4 max-w-3xl">
					{msg.type === "user" && (
						<div className="rounded-lg bg-neutral-800 px-4 py-3">
							<p className="text-sm font-medium text-neutral-400">You</p>
							<p className="mt-1 whitespace-pre-wrap text-neutral-100">{msg.content}</p>
						</div>
					)}
					{msg.type === "assistant" && (
						<div className="px-4 py-3">
							<p className="text-sm font-medium text-neutral-400">Assistant</p>
							<p className="mt-1 whitespace-pre-wrap text-neutral-100">
								{msg.content}
								{msg.streaming && <span className="ml-1 animate-pulse text-neutral-500">▊</span>}
							</p>
						</div>
					)}
					{msg.type === "tool_call" && (
						<div className="rounded-lg border border-neutral-700 px-4 py-3">
							<p className="text-sm font-medium text-blue-400">
								Tool: {msg.toolCall?.name ?? "unknown"}
							</p>
						</div>
					)}
					{msg.type === "tool_result" && (
						<div className="rounded-lg border border-neutral-700 px-4 py-3">
							<p className="text-sm font-medium text-neutral-400">Output</p>
							<pre className="mt-1 overflow-x-auto text-xs text-neutral-300">
								{msg.toolResult?.content ?? ""}
							</pre>
						</div>
					)}
					{msg.type === "system" && (
						<div className="px-4 py-2 text-center text-xs text-neutral-500">{msg.content}</div>
					)}
				</div>
			))}
		</div>
	);
}
