(() => {
    "use strict";

    const form = document.querySelector("#plannerForm");
    const input = document.querySelector("#tripInput");
    const charCount = document.querySelector("#charCount");
    const formError = document.querySelector("#formError");
    const loadingScreen = document.querySelector("#loadingScreen");
    const loadingMessage = document.querySelector("#loadingMessage");
    const loadingIndex = document.querySelector("#loadingIndex");
    const loadingProgress = document.querySelector("#loadingProgress");
    const resultScreen = document.querySelector("#resultScreen");
    const resultContent = document.querySelector("#resultContent");
    const originalRequest = document.querySelector("#originalRequest");
    const resultDate = document.querySelector("#resultDate");
    const toast = document.querySelector("#toast");
    const cancelButton = document.querySelector("#cancelRequest");

    let activeController = null;
    let stageTimer = null;
    let toastTimer = null;
    let threadId = sessionStorage.getItem("roamThread") || null;

    const loadingStages = [
        "Reading between the lines",
        "Scouting flights and stays",
        "Finding the local rhythm",
        "Binding your field guide"
    ];

    const updateClock = () => {
        const clock = document.querySelector("#localTime");
        if (!clock) return;
        clock.textContent = new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Kolkata"
        }).format(new Date());
    };

    const resizeInput = () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(Math.max(input.scrollHeight, 68), 128)}px`;
    };

    const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2300);
    };

    const setLoadingStage = (index) => {
        const safeIndex = index % loadingStages.length;
        loadingMessage.animate(
            [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 450, easing: "ease-out" }
        );
        loadingMessage.textContent = loadingStages[safeIndex];
        loadingIndex.textContent = `0${safeIndex + 1} / 04`;
        loadingProgress.style.width = `${(safeIndex + 1) * 25}%`;
    };

    const openLoading = () => {
        document.body.classList.add("no-scroll");
        resultScreen.classList.remove("is-active");
        resultScreen.setAttribute("aria-hidden", "true");
        loadingScreen.classList.add("is-active");
        loadingScreen.setAttribute("aria-hidden", "false");
        setLoadingStage(0);
        let stage = 0;
        stageTimer = setInterval(() => {
            if (stage < loadingStages.length - 1) stage += 1;
            setLoadingStage(stage);
        }, 2800);
    };

    const closeLoading = () => {
        clearInterval(stageTimer);
        loadingScreen.classList.remove("is-active");
        loadingScreen.setAttribute("aria-hidden", "true");
    };

    const showError = (message) => {
        formError.textContent = message;
        formError.classList.add("is-visible");
        form.classList.remove("shake");
        void form.offsetWidth;
        form.classList.add("shake");
    };

    const appendInlineMarkdown = (element, text) => {
        const tokenPattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s)]+)/g;
        let cursor = 0;
        let match;

        while ((match = tokenPattern.exec(text)) !== null) {
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

    const renderPlan = (markdown) => {
        resultContent.replaceChildren();
        const lines = String(markdown || "").replace(/\r/g, "").split("\n");
        let list = null;
        let listType = null;

        const endList = () => {
            list = null;
            listType = null;
        };

        lines.forEach((rawLine) => {
            const line = rawLine.trim();
            if (!line) {
                endList();
                return;
            }

            const heading = line.match(/^(#{1,3})\s+(.+)/);
            const unordered = line.match(/^[-*•]\s+(.+)/);
            const ordered = line.match(/^\d+[.)]\s+(.+)/);
            const namedSection = line.match(/^\d+[.)]\s+\*\*(Trip Summary|Flight Information|Hotel Suggestions|Day-by-day Itinerary|Estimated Budget|Final Recommendations)\**:?$/i)
                || line.match(/^\d+[.)]\s+(Trip Summary|Flight Information|Hotel Suggestions|Day-by-day Itinerary|Estimated Budget|Final Recommendations):?$/i);

            if (heading) {
                endList();
                const level = Math.min(heading[1].length + 1, 3);
                const element = document.createElement(`h${level}`);
                appendInlineMarkdown(element, heading[2]);
                resultContent.append(element);
                return;
            }

            if (/^[-_*]{3,}$/.test(line)) {
                endList();
                resultContent.append(document.createElement("hr"));
                return;
            }

            if (namedSection) {
                endList();
                const element = document.createElement("h2");
                element.textContent = namedSection[1];
                resultContent.append(element);
                return;
            }

            if (unordered || ordered) {
                const nextType = unordered ? "ul" : "ol";
                if (!list || listType !== nextType) {
                    list = document.createElement(nextType);
                    listType = nextType;
                    resultContent.append(list);
                }
                const item = document.createElement("li");
                appendInlineMarkdown(item, (unordered || ordered)[1]);
                list.append(item);
                return;
            }

            endList();
            if (line.startsWith("> ")) {
                const quote = document.createElement("blockquote");
                appendInlineMarkdown(quote, line.slice(2));
                resultContent.append(quote);
                return;
            }

            const paragraph = document.createElement("p");
            appendInlineMarkdown(paragraph, line);
            resultContent.append(paragraph);
        });

        if (!resultContent.children.length) {
            const empty = document.createElement("p");
            empty.textContent = "Your route is ready, but the field guide arrived empty. Please try once more.";
            resultContent.append(empty);
        }
    };

    const openResult = (data, request) => {
        renderPlan(data.answer || data.itinerary);
        originalRequest.textContent = request;
        resultDate.textContent = new Intl.DateTimeFormat("en", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(new Date()).toUpperCase();

        closeLoading();
        resultScreen.classList.add("is-active");
        resultScreen.setAttribute("aria-hidden", "false");
        resultScreen.scrollTop = 0;
    };

    const closeResult = () => {
        resultScreen.classList.remove("is-active");
        resultScreen.setAttribute("aria-hidden", "true");
        document.body.classList.remove("no-scroll");
        setTimeout(() => input.focus(), 200);
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = input.value.trim();

        if (!message) {
            showError("Leave us a few words about where you want to go.");
            input.focus();
            return;
        }

        formError.classList.remove("is-visible");
        activeController = new AbortController();
        openLoading();
        const minimumWait = new Promise((resolve) => setTimeout(resolve, 1700));

        try {
            const responsePromise = fetch("/api/travel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, thread_id: threadId }),
                signal: activeController.signal
            });

            const [response] = await Promise.all([responsePromise, minimumWait]);
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || "The route could not be created.");

            threadId = data.thread_id || threadId;
            if (threadId) sessionStorage.setItem("roamThread", threadId);
            openResult(data, message);
        } catch (error) {
            if (error.name === "AbortError") return;
            closeLoading();
            document.body.classList.remove("no-scroll");
            showError(error.message || "Something interrupted the journey. Please try again.");
        } finally {
            activeController = null;
        }
    });

    input.addEventListener("input", () => {
        charCount.textContent = input.value.length;
        formError.classList.remove("is-visible");
        resizeInput();
    });

    document.querySelectorAll("[data-prompt]").forEach((button) => {
        button.addEventListener("click", () => {
            input.value = button.dataset.prompt;
            input.dispatchEvent(new Event("input"));
            input.focus();
        });
    });

    cancelButton.addEventListener("click", () => {
        if (activeController) activeController.abort();
        closeLoading();
        document.body.classList.remove("no-scroll");
        showToast("Journey paused");
    });

    document.querySelector("#newPlan").addEventListener("click", closeResult);
    document.querySelector("#resultHome").addEventListener("click", (event) => {
        event.preventDefault();
        closeResult();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.querySelector("#copyPlan").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(resultContent.innerText);
            showToast("Field guide copied");
        } catch {
            showToast("Copy unavailable — select the text instead");
        }
    });

    document.querySelector("#printPlan").addEventListener("click", () => window.print());

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && resultScreen.classList.contains("is-active")) closeResult();
    });

    updateClock();
    setInterval(updateClock, 30000);
})();
