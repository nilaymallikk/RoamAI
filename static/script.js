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
    let thinkingTimer = null;
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
        const tokens = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
        let cursor = 0;
        let match;

        while ((match = tokens.exec(text)) !== null) {
            if (match.index > cursor) element.append(document.createTextNode(text.slice(cursor, match.index)));
            const token = match[0];
            let node;

            if (token.startsWith("[")) {
                const markdownLink = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
                node = document.createElement("a");
                node.href = markdownLink[2];
                node.textContent = markdownLink[1];
                node.target = "_blank";
                node.rel = "noopener noreferrer";
            } else if (token.startsWith("**")) {
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

    const extractSourceLinks = (...values) => {
        const links = new Map();

        values.filter(Boolean).forEach((value) => {
            const text = String(value);
            const titledPattern = /\*\*([^*\n]+)\*\*\s*\n\s*(https?:\/\/[^\s]+)/g;
            let match;

            while ((match = titledPattern.exec(text)) !== null) {
                const href = match[2].replace(/[.,;:]$/, "");
                links.set(href, match[1].trim());
            }

            const urlPattern = /https?:\/\/[^\s)]+/g;
            while ((match = urlPattern.exec(text)) !== null) {
                const href = match[0].replace(/[.,;:]$/, "");
                if (links.has(href)) continue;
                try {
                    links.set(href, new URL(href).hostname.replace(/^www\./, ""));
                } catch {
                    // Ignore malformed URLs returned by a provider.
                }
            }
        });

        return Array.from(links, ([href, label]) => ({ href, label })).slice(0, 10);
    };

    const createSourceShelf = (links, compact = false) => {
        if (!links.length) return null;
        const shelf = document.createElement("div");
        shelf.className = compact ? "source-shelf source-shelf-compact" : "source-shelf";

        const label = document.createElement("span");
        label.className = "source-label";
        label.textContent = compact ? "Links" : "Sources & useful links";
        shelf.append(label);

        const list = document.createElement("div");
        list.className = "source-links";
        links.forEach(({ href, label: linkLabel }) => {
            const anchor = document.createElement("a");
            anchor.href = href;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
            anchor.querySelector("span").textContent = linkLabel;
            list.append(anchor);
        });
        shelf.append(list);
        return shelf;
    };

    const AGENT_SECTIONS = [
        {
            key: "flightResults",
            step: "01",
            title: "Flight Agent",
            description: "Routes, schedules and live-status findings",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 13 18-8-7 16-3-7-8-1Z"/><path d="m11 14 4-4"/></svg>'
        },
        {
            key: "hotelResults",
            step: "02",
            title: "Hotel Agent",
            description: "Stays, neighbourhoods and research sources",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5h16v14M4 15h16M8 9h3v3H8zM15 9h3v3h-3z"/></svg>'
        },
        {
            key: "itinerary",
            step: "03",
            title: "Itinerary Agent",
            description: "Day-by-day pacing and practical details",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6"/></svg>'
        },
        {
            key: "finalResponse",
            step: "04",
            title: "Final Agent",
            description: "Research synthesis and recommendations",
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 9.7 9.7 3 12l6.7 2.3L12 21l2.3-6.7L21 12l-6.7-2.3L12 3Z"/></svg>'
        }
    ];

    const renderAgentSection = (config, report, index) => {
        const details = document.createElement("details");
        details.className = `agent-section agent-section-${config.step}`;
        details.open = index === 0;

        const summary = document.createElement("summary");
        summary.innerHTML = `
            <span class="agent-step">${config.step}</span>
            <span class="agent-icon">${config.icon}</span>
            <span class="agent-heading"><strong></strong><small></small></span>
            <span class="agent-status"><i></i> Complete</span>
            <svg class="agent-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>`;
        summary.querySelector("strong").textContent = config.title;
        summary.querySelector("small").textContent = config.description;
        details.append(summary);

        const content = document.createElement("div");
        content.className = "agent-section-content";
        const output = report[config.key] || `No output was returned by the ${config.title}.`;
        renderMarkdown(content, output);
        const sources = createSourceShelf(extractSourceLinks(output), true);
        if (sources) content.append(sources);
        details.append(content);
        return details;
    };

    const renderAgentReport = (container, report) => {
        container.classList.add("agent-report-body");

        const overview = document.createElement("section");
        overview.className = "report-overview";
        overview.innerHTML = `
            <div class="report-kicker"><span>Multi-agent run complete</span><i></i><span>Report ready</span></div>
            <h2>Four specialists.<br><em>One considered journey.</em></h2>
            <p>Open any agent card to inspect its research, then use the consolidated travel plan below.</p>
            <div class="report-metrics">
                <div><strong>4</strong><span>Agents run</span></div>
                <div><strong></strong><span>LLM calls</span></div>
                <div><strong class="metric-check">✓</strong><span>Status</span></div>
            </div>`;
        overview.querySelector(".report-metrics div:nth-child(2) strong").textContent = String(report.llmCalls ?? 4);
        container.append(overview);

        const pipelineLabel = document.createElement("div");
        pipelineLabel.className = "pipeline-label";
        pipelineLabel.innerHTML = "<span>Agent pipeline</span><span>Click a section to expand</span>";
        container.append(pipelineLabel);

        const pipeline = document.createElement("div");
        pipeline.className = "agent-pipeline";
        AGENT_SECTIONS.forEach((config, index) => pipeline.append(renderAgentSection(config, report, index)));
        container.append(pipeline);

        const finalPlan = document.createElement("section");
        finalPlan.className = "final-travel-plan";
        const finalHeader = document.createElement("header");
        finalHeader.innerHTML = `
            <div><span class="final-plan-index">FINAL / 05</span><h2>Your travel plan</h2></div>
            <span class="final-plan-seal">ROAM<br>READY</span>`;
        finalPlan.append(finalHeader);

        const finalContent = document.createElement("div");
        finalContent.className = "final-plan-content";
        renderMarkdown(finalContent, report.finalResponse || "No final travel plan was returned.");
        finalPlan.append(finalContent);

        const allSources = createSourceShelf(extractSourceLinks(
            report.flightResults,
            report.hotelResults,
            report.itinerary,
            report.finalResponse
        ));
        if (allSources) finalPlan.append(allSources);
        container.append(finalPlan);
    };

    const buildReportMarkdown = (message) => {
        if (!message.report) return message.content;
        const report = message.report;
        return `# ROAM Travel Plan\n\n## Flight Agent\n${report.flightResults || "N/A"}\n\n---\n\n## Hotel Agent\n${report.hotelResults || "N/A"}\n\n---\n\n## Itinerary Agent\n${report.itinerary || "N/A"}\n\n---\n\n## Final Agent\n${report.finalResponse || "N/A"}\n\n---\n\n# Final Travel Plan\n${report.finalResponse || "N/A"}`;
    };

    const createMessageElement = (message) => {
        const article = document.createElement("article");
        article.className = `message message-${message.role}`;
        if (message.error) article.classList.add("message-error");
        if (message.report) article.classList.add("message-report");

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
        if (message.role === "assistant" && !message.error && message.report) renderAgentReport(body, message.report);
        else if (message.role === "assistant" && !message.error) renderMarkdown(body, message.content);
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
            if (message.report) {
                const download = document.createElement("button");
                download.type = "button";
                download.dataset.downloadMessage = message.id;
                download.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg><span>Download plan</span>';
                actions.append(download);
            }
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
        clearInterval(thinkingTimer);
        const article = document.createElement("article");
        article.className = "message message-assistant";
        article.id = "thinkingMessage";
        article.innerHTML = `
            <div class="message-inner">
                <div class="message-label"><span class="assistant-mark" aria-hidden="true">R</span><strong>ROAM</strong><span>Researching</span></div>
                <div class="thinking-card">
                    <div class="thinking"><span id="thinkingLabel">Flight Agent is tracing routes</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
                    <div class="thinking-steps" aria-label="Agent progress">
                        <span class="is-active">Flights</span><span>Hotels</span><span>Itinerary</span><span>Final plan</span>
                    </div>
                </div>
            </div>`;
        elements.conversation.append(article);
        const stages = [
            "Flight Agent is tracing routes",
            "Hotel Agent is researching stays",
            "Itinerary Agent is shaping each day",
            "Final Agent is assembling your plan"
        ];
        let stage = 0;
        thinkingTimer = setInterval(() => {
            if (stage < stages.length - 1) stage += 1;
            const thinkingMessage = document.querySelector("#thinkingMessage");
            if (!thinkingMessage) return;
            thinkingMessage.querySelector("#thinkingLabel").textContent = stages[stage];
            thinkingMessage.querySelectorAll(".thinking-steps span").forEach((step, index) => {
                step.classList.toggle("is-done", index < stage);
                step.classList.toggle("is-active", index === stage);
            });
        }, 2600);
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
                report: {
                    flightResults: data.flight_results || "",
                    hotelResults: data.hotel_results || "",
                    itinerary: data.itinerary || "",
                    finalResponse: data.answer || "",
                    llmCalls: data.llm_calls ?? 4
                },
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
            clearInterval(thinkingTimer);
            thinkingTimer = null;
            activeRequest = null;
            setRequestState(false);
            renderHistory();
            renderConversation();
            elements.input.focus();
        }
    };

    const startNewConversation = () => {
        if (activeRequest) activeRequest.abort();
        clearInterval(thinkingTimer);
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
        clearInterval(thinkingTimer);
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
        const button = event.target.closest("[data-copy-message], [data-download-message]");
        if (!button) return;
        const conversation = getActiveConversation();
        const messageId = button.dataset.copyMessage || button.dataset.downloadMessage;
        const message = conversation?.messages.find((item) => item.id === messageId);
        if (!message) return;

        if (button.dataset.downloadMessage) {
            const blob = new Blob([buildReportMarkdown(message)], { type: "text/markdown;charset=utf-8" });
            const href = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const safeTitle = (conversation.title || "travel-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
            link.href = href;
            link.download = `${safeTitle || "travel-plan"}.md`;
            link.click();
            URL.revokeObjectURL(href);
            showToast("Travel plan downloaded");
            return;
        }

        try {
            await navigator.clipboard.writeText(buildReportMarkdown(message));
            showToast("Travel plan copied");
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
        clearInterval(thinkingTimer);
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
