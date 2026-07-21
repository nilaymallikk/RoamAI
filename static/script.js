(() => {
    "use strict";

    const HISTORY_KEY = "roam.chat.history.v1";
    const ACTIVE_KEY = "roam.chat.active.v1";
    const RETENTION_MS = 24 * 60 * 60 * 1000;

    const elements = {
        form: document.querySelector("#chatForm"),
        input: document.querySelector("#messageInput"),
        send: document.querySelector("#sendButton"),
        charCount: document.querySelector("#charCount"),
        welcome: document.querySelector("#welcome"),
        conversation: document.querySelector("#conversation"),
        chatScroll: document.querySelector("#chatScroll"),
        historyList: document.querySelector("#historyList"),
        historyEmptyTemplate: document.querySelector("#historyEmptyTemplate"),
        activeTitle: document.querySelector("#activeChatTitle"),
        toast: document.querySelector("#toast"),
        sidebarScrim: document.querySelector("#sidebarScrim")
    };

    let conversations = [];
    let activeConversationId = null;
    let activeRequest = null;
    let toastTimer = null;

    const makeId = () => {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return `journey-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const getActiveConversation = () => conversations.find((item) => item.id === activeConversationId) || null;

    const pruneExpired = () => {
        const cutoff = Date.now() - RETENTION_MS;
        conversations = conversations.filter((item) => Number(item.updatedAt) > cutoff);
        if (activeConversationId && !getActiveConversation()) {
            activeConversationId = null;
            localStorage.removeItem(ACTIVE_KEY);
        }
    };

    const loadHistory = () => {
        try {
            const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
            conversations = Array.isArray(stored)
                ? stored.filter((item) => item && item.id && Array.isArray(item.messages))
                : [];
        } catch {
            conversations = [];
        }

        pruneExpired();
        const requestedActiveId = localStorage.getItem(ACTIVE_KEY);
        activeConversationId = conversations.some((item) => item.id === requestedActiveId)
            ? requestedActiveId
            : null;
        saveHistory(false);
    };

    const saveHistory = (notifyOnError = true) => {
        pruneExpired();
        conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
            if (activeConversationId) localStorage.setItem(ACTIVE_KEY, activeConversationId);
            else localStorage.removeItem(ACTIVE_KEY);
        } catch {
            if (notifyOnError) showToast("Browser storage is full");
        }
    };

    const showToast = (message) => {
        elements.toast.textContent = message;
        elements.toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
    };

    const formatAge = (timestamp) => {
        const elapsed = Math.max(0, Date.now() - timestamp);
        const minutes = Math.floor(elapsed / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    const titleFromMessage = (message) => {
        const clean = message.replace(/\s+/g, " ").trim();
        return clean.length > 46 ? `${clean.slice(0, 46).trim()}…` : clean;
    };

    const renderHistory = () => {
        pruneExpired();
        elements.historyList.replaceChildren();

        if (!conversations.length) {
            elements.historyList.append(elements.historyEmptyTemplate.content.cloneNode(true));
            return;
        }

        conversations
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .forEach((conversation) => {
                const row = document.createElement("div");
                row.className = "history-row";
                if (conversation.id === activeConversationId) row.classList.add("is-active");

                const openButton = document.createElement("button");
                openButton.type = "button";
                openButton.className = "history-open";
                openButton.dataset.conversationId = conversation.id;
                openButton.setAttribute("aria-label", `Open ${conversation.title}`);

                const title = document.createElement("span");
                title.textContent = conversation.title || "Untitled journey";
                const age = document.createElement("small");
                age.textContent = formatAge(conversation.updatedAt);
                openButton.append(title, age);

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "history-delete";
                deleteButton.dataset.deleteId = conversation.id;
                deleteButton.setAttribute("aria-label", `Delete ${conversation.title}`);
                deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

                row.append(openButton, deleteButton);
                elements.historyList.append(row);
            });
    };

    const appendInlineMarkdown = (element, text) => {
        const tokens = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
        let cursor = 0;
        let match;

        while ((match = tokens.exec(text)) !== null) {
            if (match.index > cursor) element.append(document.createTextNode(text.slice(cursor, match.index)));
            const token = match[0];
            let node;

            if (token.startsWith("**")) {
                node = document.createElement("strong");
                node.textContent = token.slice(2, -2);
            } else if (token.startsWith("*")) {
                node = document.createElement("em");
                node.textContent = token.slice(1, -1);
            } else if (token.startsWith("`")) {
                node = document.createElement("code");
                node.textContent = token.slice(1, -1);
            } else {
                node = document.createElement("a");
                node.href = token;
                node.textContent = token;
                node.target = "_blank";
                node.rel = "noopener noreferrer";
            }

            element.append(node);
            cursor = match.index + token.length;
        }

        if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
    };

    const appendTable = (container, rows) => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrap";
        const table = document.createElement("table");

        rows.forEach((row, rowIndex) => {
            const tableRow = document.createElement("tr");
            row.forEach((cell) => {
                const element = document.createElement(rowIndex === 0 ? "th" : "td");
                appendInlineMarkdown(element, cell.trim());
                tableRow.append(element);
            });
            (rowIndex === 0 ? table.createTHead() : (table.tBodies[0] || table.createTBody())).append(tableRow);
        });

        wrapper.append(table);
        container.append(wrapper);
    };

    const renderMarkdown = (container, markdown) => {
        container.replaceChildren();
        const lines = String(markdown || "").replace(/\r/g, "").split("\n");
        let list = null;
        let listType = null;

        const endList = () => {
            list = null;
            listType = null;
        };

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index].trim();
            if (!line) {
                endList();
                continue;
            }

            const nextLine = (lines[index + 1] || "").trim();
            const isTable = line.includes("|") && /^\|?\s*:?-{3,}/.test(nextLine);
            if (isTable) {
                endList();
                const rows = [line.split("|").filter((cell, cellIndex, array) => cell.trim() || (cellIndex > 0 && cellIndex < array.length - 1))];
                index += 2;
                while (index < lines.length && lines[index].includes("|")) {
                    rows.push(lines[index].trim().split("|").filter((cell, cellIndex, array) => cell.trim() || (cellIndex > 0 && cellIndex < array.length - 1)));
                    index += 1;
                }
                index -= 1;
                appendTable(container, rows);
                continue;
            }

            const heading = line.match(/^(#{1,3})\s+(.+)/);
            const boldHeading = line.match(/^\*\*(.{2,70}?)\*\*:?$/);
            const namedSection = line.match(/^\d+[.)]\s+\*\*(Trip Summary|Flight Information|Hotel Suggestions|Day-by-day Itinerary|Estimated Budget|Final Recommendations)\**:?$/i)
                || line.match(/^\d+[.)]\s+(Trip Summary|Flight Information|Hotel Suggestions|Day-by-day Itinerary|Estimated Budget|Final Recommendations):?$/i);
            const unordered = line.match(/^[-*•]\s+(.+)/);
            const ordered = line.match(/^\d+[.)]\s+(.+)/);

            if (heading || boldHeading || namedSection) {
                endList();
                const element = document.createElement(heading ? `h${Math.min(heading[1].length + 1, 3)}` : namedSection ? "h2" : "h3");
                appendInlineMarkdown(element, heading ? heading[2] : (namedSection || boldHeading)[1]);
                container.append(element);
                continue;
            }

            if (/^[-_*]{3,}$/.test(line)) {
                endList();
                container.append(document.createElement("hr"));
                continue;
            }

            if (unordered || ordered) {
                const nextType = unordered ? "ul" : "ol";
                if (!list || listType !== nextType) {
                    list = document.createElement(nextType);
                    listType = nextType;
                    container.append(list);
                }
                const item = document.createElement("li");
                appendInlineMarkdown(item, (unordered || ordered)[1]);
                list.append(item);
                continue;
            }

            endList();
            if (line.startsWith("> ")) {
                const quote = document.createElement("blockquote");
                appendInlineMarkdown(quote, line.slice(2));
                container.append(quote);
                continue;
            }

            const paragraph = document.createElement("p");
            appendInlineMarkdown(paragraph, line);
            container.append(paragraph);
        }
    };

    const createMessageElement = (message) => {
        const article = document.createElement("article");
        article.className = `message message-${message.role}`;
        if (message.error) article.classList.add("message-error");

        const inner = document.createElement("div");
        inner.className = "message-inner";

        if (message.role === "assistant") {
            const label = document.createElement("div");
            label.className = "message-label";
            label.innerHTML = '<span class="assistant-mark" aria-hidden="true">R</span><strong>ROAM</strong><span>Travel planner</span>';
            inner.append(label);
        }

        const body = document.createElement("div");
        body.className = "message-body";
        if (message.role === "assistant" && !message.error) renderMarkdown(body, message.content);
        else body.textContent = message.content;
        inner.append(body);
        article.append(inner);

        if (message.role === "assistant" && !message.error) {
            const actions = document.createElement("div");
            actions.className = "message-actions";
            const copy = document.createElement("button");
            copy.type = "button";
            copy.dataset.copyMessage = message.id;
            copy.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>Copy</span>';
            actions.append(copy);
            article.append(actions);
        }

        return article;
    };

    const renderConversation = () => {
        const conversation = getActiveConversation();
        elements.conversation.replaceChildren();

        if (!conversation || !conversation.messages.length) {
            elements.welcome.classList.remove("is-hidden");
            elements.conversation.classList.remove("has-messages");
            elements.activeTitle.textContent = "New journey";
            return;
        }

        elements.welcome.classList.add("is-hidden");
        elements.conversation.classList.add("has-messages");
        elements.activeTitle.textContent = conversation.title;
        conversation.messages.forEach((message) => elements.conversation.append(createMessageElement(message)));
        scrollToLatest(false);
    };

    const showThinking = () => {
        const article = document.createElement("article");
        article.className = "message message-assistant";
        article.id = "thinkingMessage";
        article.innerHTML = `
            <div class="message-inner">
                <div class="message-label"><span class="assistant-mark" aria-hidden="true">R</span><strong>ROAM</strong><span>Researching</span></div>
                <div class="thinking">Tracing the route <span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
            </div>`;
        elements.conversation.append(article);
        scrollToLatest(true);
    };

    const scrollToLatest = (smooth = true) => {
        requestAnimationFrame(() => {
            elements.chatScroll.scrollTo({
                top: elements.chatScroll.scrollHeight,
                behavior: smooth ? "smooth" : "auto"
            });
        });
    };

    const resizeInput = () => {
        elements.input.style.height = "auto";
        elements.input.style.height = `${Math.min(Math.max(elements.input.scrollHeight, 30), 150)}px`;
    };

    const setRequestState = (isLoading) => {
        elements.send.disabled = isLoading || !elements.input.value.trim();
        elements.input.setAttribute("aria-busy", String(isLoading));
    };

    const createConversation = (firstMessage) => {
        const now = Date.now();
        const conversation = {
            id: makeId(),
            title: titleFromMessage(firstMessage),
            threadId: null,
            createdAt: now,
            updatedAt: now,
            messages: []
        };
        conversations.unshift(conversation);
        activeConversationId = conversation.id;
        return conversation;
    };

    const sendMessage = async (message) => {
        if (activeRequest || !message.trim()) return;

        let conversation = getActiveConversation();
        if (!conversation) conversation = createConversation(message);

        conversation.messages.push({
            id: makeId(),
            role: "user",
            content: message.trim(),
            createdAt: Date.now()
        });
        conversation.updatedAt = Date.now();
        saveHistory();
        renderHistory();
        renderConversation();

        elements.input.value = "";
        elements.charCount.textContent = "0";
        resizeInput();
        setRequestState(true);
        showThinking();

        activeRequest = new AbortController();
        const requestConversationId = conversation.id;

        try {
            const response = await fetch("/api/travel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: message.trim(),
                    thread_id: conversation.threadId
                }),
                signal: activeRequest.signal
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || "The journey could not be created.");

            const targetConversation = conversations.find((item) => item.id === requestConversationId);
            if (!targetConversation) return;
            targetConversation.threadId = data.thread_id || targetConversation.threadId;
            targetConversation.messages.push({
                id: makeId(),
                role: "assistant",
                content: data.answer || data.itinerary || "I could not find enough information for that route.",
                createdAt: Date.now()
            });
            targetConversation.updatedAt = Date.now();
            saveHistory();
        } catch (error) {
            if (error.name === "AbortError") return;
            const targetConversation = conversations.find((item) => item.id === requestConversationId);
            if (targetConversation) {
                targetConversation.messages.push({
                    id: makeId(),
                    role: "assistant",
                    content: error.message || "Something interrupted the journey. Please try again.",
                    error: true,
                    createdAt: Date.now()
                });
                targetConversation.updatedAt = Date.now();
                saveHistory();
            }
        } finally {
            activeRequest = null;
            setRequestState(false);
            renderHistory();
            renderConversation();
            elements.input.focus();
        }
    };

    const startNewConversation = () => {
        if (activeRequest) activeRequest.abort();
        activeRequest = null;
        activeConversationId = null;
        localStorage.removeItem(ACTIVE_KEY);
        elements.input.value = "";
        elements.charCount.textContent = "0";
        resizeInput();
        setRequestState(false);
        renderHistory();
        renderConversation();
        closeSidebar();
        setTimeout(() => elements.input.focus(), 100);
    };

    const openConversation = (conversationId) => {
        if (activeRequest) activeRequest.abort();
        activeRequest = null;
        activeConversationId = conversationId;
        saveHistory();
        setRequestState(false);
        renderHistory();
        renderConversation();
        closeSidebar();
    };

    const deleteConversation = (conversationId) => {
        conversations = conversations.filter((item) => item.id !== conversationId);
        if (activeConversationId === conversationId) activeConversationId = null;
        saveHistory();
        renderHistory();
        renderConversation();
        showToast("Journey removed");
    };

    const openSidebar = () => document.body.classList.add("sidebar-open");
    const closeSidebar = () => document.body.classList.remove("sidebar-open");

    elements.form.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage(elements.input.value);
    });

    elements.input.addEventListener("input", () => {
        elements.charCount.textContent = String(elements.input.value.length);
        resizeInput();
        setRequestState(Boolean(activeRequest));
    });

    elements.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            elements.form.requestSubmit();
        }
    });

    document.querySelectorAll("[data-prompt]").forEach((button) => {
        button.addEventListener("click", () => sendMessage(button.dataset.prompt));
    });

    elements.historyList.addEventListener("click", (event) => {
        const openButton = event.target.closest("[data-conversation-id]");
        const deleteButton = event.target.closest("[data-delete-id]");
        if (openButton) openConversation(openButton.dataset.conversationId);
        if (deleteButton) deleteConversation(deleteButton.dataset.deleteId);
    });

    elements.conversation.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy-message]");
        if (!button) return;
        const conversation = getActiveConversation();
        const message = conversation?.messages.find((item) => item.id === button.dataset.copyMessage);
        if (!message) return;
        try {
            await navigator.clipboard.writeText(message.content);
            showToast("Response copied");
        } catch {
            showToast("Clipboard unavailable");
        }
    });

    document.querySelector("#newChat").addEventListener("click", startNewConversation);
    document.querySelector("#headerNewChat").addEventListener("click", startNewConversation);
    document.querySelector("#brandHome").addEventListener("click", (event) => {
        event.preventDefault();
        startNewConversation();
    });
    document.querySelector("#openSidebar").addEventListener("click", openSidebar);
    document.querySelector("#closeSidebar").addEventListener("click", closeSidebar);
    elements.sidebarScrim.addEventListener("click", closeSidebar);

    document.querySelector("#clearHistory").addEventListener("click", () => {
        if (!conversations.length) return;
        if (!window.confirm("Clear all journey history from this browser?")) return;
        if (activeRequest) activeRequest.abort();
        activeRequest = null;
        conversations = [];
        activeConversationId = null;
        saveHistory();
        renderHistory();
        renderConversation();
        showToast("History cleared");
    });

    document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            startNewConversation();
        }
        if (event.key === "Escape") closeSidebar();
    });

    const updateClock = () => {
        const clock = document.querySelector("#localTime");
        clock.textContent = `${new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Kolkata"
        }).format(new Date())} IST`;
    };

    loadHistory();
    renderHistory();
    renderConversation();
    updateClock();
    setRequestState(false);
    setInterval(updateClock, 30000);
    setInterval(() => {
        const before = conversations.length;
        pruneExpired();
        if (conversations.length !== before) {
            saveHistory(false);
            renderHistory();
            renderConversation();
        }
    }, 5 * 60 * 1000);
})();
