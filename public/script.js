class AIAgentUI {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.sessionId = this.generateSessionId();
        this.messageCount = 0;
        
        this.initializeElements();
        this.attachEventListeners();
        this.checkServerStatus();
        this.updateSessionInfo();
        this.setupTextareaAutoResize();
    }

    initializeElements() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.chatMessages = document.getElementById('chatMessages');
        this.clearChatButton = document.getElementById('clearChat');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.charCount = document.getElementById('charCount');
        this.sessionIdElement = document.getElementById('sessionId');
        this.messageCountElement = document.getElementById('messageCount');
        this.responseTimeElement = document.getElementById('responseTime');
        this.tokenUsageElement = document.getElementById('tokenUsage');
        this.pluginsUsedElement = document.getElementById('pluginsUsed');
        this.sourcesUsedElement = document.getElementById('sourcesUsed');
    }

    attachEventListeners() {
        // Send message events
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // Enhanced keyboard handling for textarea
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Character counter with better handling
        this.messageInput.addEventListener('input', () => {
            this.updateCharCounter();
            this.autoResizeTextarea();
        });

        // Clear chat
        this.clearChatButton.addEventListener('click', () => this.clearChat());

        // Example queries
        document.addEventListener('click', (e) => {
            if (e.target.closest('.example-card')) {
                const card = e.target.closest('.example-card');
                const query = card.getAttribute('data-query');
                this.messageInput.value = query;
                this.updateCharCounter();
                this.autoResizeTextarea();
                this.sendMessage();
            }
        });

        // API endpoint buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.tool-btn')) {
                const button = e.target.closest('.tool-btn');
                const endpoint = button.getAttribute('data-endpoint');
                this.testEndpoint(endpoint);
            }
        });
    }

    setupTextareaAutoResize() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    }

    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    }

    updateCharCounter() {
        const length = this.messageInput.value.length;
        this.charCount.textContent = `${length}/500`;
        
        if (length > 450) {
            this.charCount.style.color = '#ef4444';
        } else if (length > 400) {
            this.charCount.style.color = '#f59e0b';
        } else {
            this.charCount.style.color = '#64748b';
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    updateSessionInfo() {
        this.sessionIdElement.textContent = this.sessionId.substring(0, 16) + '...';
        this.messageCountElement.textContent = this.messageCount;
    }

    async checkServerStatus() {
        try {
            const response = await fetch(`${this.baseURL}/health`);
            const isOnline = response.ok;
            this.updateStatusIndicator(isOnline);
        } catch (error) {
            this.updateStatusIndicator(false);
        }
    }

    updateStatusIndicator(isOnline) {
        const statusDot = this.statusIndicator.querySelector('.status-dot');
        
        if (isOnline) {
            statusDot.className = 'status-dot online';
            this.statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'status-dot offline';
            this.statusText.textContent = 'Offline';
        }
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        // Add user message to chat
        this.addMessage('user', message);
        this.messageInput.value = '';
        this.updateCharCounter();
        this.autoResizeTextarea();

        // Show loading
        this.showLoading(true);

        try {
            const startTime = Date.now();
            const response = await fetch(`${this.baseURL}/api/agent/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    session_id: this.sessionId
                })
            });

            const responseTime = Date.now() - startTime;

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.addMessage('bot', data.data.response, data.data);
                this.updateMetrics(responseTime, data.data);
                this.messageCount++;
                this.updateSessionInfo();
            } else {
                throw new Error(data.error || 'Unknown error occurred');
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage('bot', `Error: ${error.message}`, null, true);
        } finally {
            this.showLoading(false);
        }
    }

    addMessage(sender, content, metadata = null, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const timestamp = new Date().toLocaleTimeString();
        const senderName = sender === 'user' ? 'You' : 'AI Agent';
        const avatarText = sender === 'user' ? 'U' : 'AI';

        let pluginsHtml = '';
        if (metadata && metadata.plugins_used && metadata.plugins_used.length > 0) {
            pluginsHtml = metadata.plugins_used.map(plugin => 
                `<span class="plugin-tag">${plugin}</span>`
            ).join('');
        }

        messageDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar ${sender}-avatar">${avatarText}</div>
                <strong>${senderName}</strong>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content ${isError ? 'error-message' : ''}">
                ${this.formatMessage(content)}
            </div>
            ${metadata ? `
                <div class="message-meta">
                    <div class="message-plugins">${pluginsHtml}</div>
                    <small>Session: ${metadata.session_id ? metadata.session_id.substring(0, 8) + '...' : 'N/A'}</small>
                </div>
            ` : ''}
        `;

        // Remove welcome message if it exists
        const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    formatMessage(content) {
        // Enhanced markdown-like formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: #f1f5f9; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>')
            .replace(/\n/g, '<br>');
    }

    updateMetrics(responseTime, data) {
        this.responseTimeElement.textContent = `${responseTime}ms`;
        
        if (data.metadata && data.metadata.token_usage) {
            const usage = data.metadata.token_usage;
            this.tokenUsageElement.textContent = `${usage.total_tokens}`;
        }
        
        if (data.plugins_used) {
            this.pluginsUsedElement.textContent = data.plugins_used.length > 0 ? data.plugins_used.join(', ') : 'None';
        }
        
        if (data.sources_used) {
            this.sourcesUsedElement.textContent = data.sources_used.length > 0 ? data.sources_used.length.toString() : '0';
        }
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showLoading(show) {
        this.loadingOverlay.style.display = show ? 'flex' : 'none';
        this.sendButton.disabled = show;
        this.messageInput.disabled = show;
        
        if (show) {
            this.sendButton.textContent = 'Sending...';
        } else {
            this.sendButton.textContent = 'Send';
        }
    }

    clearChat() {
        if (confirm('Clear conversation history?')) {
            this.chatMessages.innerHTML = `
                <div class="welcome-message">
                    <h3>Welcome back to AI Agent Console</h3>
                    <p>Start a new conversation with our AI agent. Try these examples:</p>
                    <div class="example-grid">
                        <button class="example-card" data-query="Calculate 25 * 4 + 10">
                            <span class="example-title">Math Calculation</span>
                            <span class="example-desc">25 * 4 + 10</span>
                        </button>
                        <button class="example-card" data-query="What's the weather in New York?">
                            <span class="example-title">Weather Query</span>
                            <span class="example-desc">New York weather</span>
                        </button>
                        <button class="example-card" data-query="Explain machine learning">
                            <span class="example-title">Knowledge Base</span>
                            <span class="example-desc">Explain ML concepts</span>
                        </button>
                        <button class="example-card" data-query="Hello, what can you help me with?">
                            <span class="example-title">General Chat</span>
                            <span class="example-desc">Start conversation</span>
                        </button>
                    </div>
                </div>
            `;
            this.messageCount = 0;
            this.sessionId = this.generateSessionId();
            this.updateSessionInfo();
            this.resetMetrics();
        }
    }

    resetMetrics() {
        this.responseTimeElement.textContent = '-';
        this.tokenUsageElement.textContent = '-';
        this.pluginsUsedElement.textContent = '-';
        this.sourcesUsedElement.textContent = '-';
    }

    async testEndpoint(endpoint) {
        try {
            this.showLoading(true);
            const response = await fetch(`${this.baseURL}${endpoint}`);
            const data = await response.json();
            
            // Show the response in chat
            this.addMessage('bot', `**API Endpoint:** ${endpoint}\n\n**Response:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``);
            
        } catch (error) {
            this.addMessage('bot', `Error testing endpoint ${endpoint}: ${error.message}`, null, true);
        } finally {
            this.showLoading(false);
        }
    }
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.aiAgentUI = new AIAgentUI();
});

// Periodically check server status
setInterval(() => {
    if (window.aiAgentUI) {
        window.aiAgentUI.checkServerStatus();
    }
}, 30000); // Check every 30 seconds
