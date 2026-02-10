export {};

declare global {
  interface Window {
    glass?: {
      isElectron?: boolean;
      permissions?: {
        set: (input: { scopes?: string[] | string; source?: string; allowAll?: boolean }) => {
          ok: boolean;
          scopes?: string[];
          acceptedScopes?: string[];
          unknownScopes?: string[];
          source?: string | null;
          allowAll?: boolean;
          error?: string;
        };
        get: () => {
          ok: boolean;
          scopes?: string[];
          source?: string | null;
          allowAll?: boolean;
          error?: string;
        };
        allowedScopes: () => {
          ok: boolean;
          scopes?: string[];
          error?: string;
        };
      };
      clipboard?: {
        readText: () => string | Promise<string>;
        writeText: (text: string) => boolean | Promise<boolean>;
      };
      captureWebContents?: (
        webContentsId: number,
        options?: { format?: 'jpeg' | 'png'; quality?: number; width?: number; height?: number }
      ) => Promise<{ mimeType: string; data: string } | null>;
      captureNativeSnapshot?: (
        options?: { format?: 'jpeg' | 'png'; quality?: number; width?: number; height?: number }
      ) => Promise<{ mimeType: string; data: string } | null>;
      invokeWithMeta?: (channel: string, payload?: any, meta?: { requestId?: string; [key: string]: any }) => Promise<any>;
      saveUserFile?: (args: {
        dataUrl?: string;
        data?: string; // base64 (no prefix)
        mimeType?: string;
        subdir?: string;
        prefix?: string;
      }) => Promise<{ ok: boolean; path?: string; filename?: string; mimeType?: string; error?: string }>;
      window?: {
        setFullscreen: (fullscreen: boolean) => Promise<{ ok: boolean; fullscreen?: boolean; error?: string }>;
        getFullscreen: () => Promise<{ ok: boolean; fullscreen?: boolean; error?: string }>;
      };
      diagnostics?: {
        getAppMeta: () => Promise<{ ok: boolean; meta?: any; error?: string }>;
        getMainLog: (args?: { maxLines?: number; maxBytes?: number }) => Promise<{
          ok: boolean;
          text?: string;
          logPath?: string;
          error?: string;
        }>;
        listReleases: (args?: { includeHashes?: boolean; maxFiles?: number }) => Promise<{
          ok: boolean;
          releases?: any[];
          error?: string;
        }>;
        getBundleStats: () => Promise<{
          ok: boolean;
          path?: string;
          stats?: any;
          summary?: {
            measuredAtMs?: number | null;
            appVersion?: string | null;
            chunkCount?: number;
            indexRawBytes?: number | null;
            backtesterRawBytes?: number | null;
            settingsRawBytes?: number | null;
          };
          error?: string;
        }>;
      };
      news?: {
        getSnapshot: (args: { symbol: string; limit?: number; force?: boolean }) => Promise<{
          ok: boolean;
          snapshot?: any;
          cached?: boolean;
          error?: string;
        }>;
      };
      calendar?: {
        getEvents: (args?: {
          lookbackHours?: number;
          lookaheadHours?: number;
          force?: boolean;
          sources?: string[];
        }) => Promise<{
          ok: boolean;
          events?: Array<{
            id: string;
            title: string;
            currency?: string | null;
            country?: string | null;
            impact?: string | null;
            actual?: string | null;
            forecast?: string | null;
            previous?: string | null;
            startAtMs?: number | null;
            endAtMs?: number | null;
            url?: string | null;
            source?: string | null;
            status?: string | null;
          }>;
          cached?: boolean;
          fetchedAtMs?: number;
          error?: string;
        }>;
      };
      telegram?: {
        sendMessage: (args: { botToken: string; chatId: string; text: string; replyMarkup?: any }) => Promise<{
          ok: boolean;
          result?: any;
          error?: string;
        }>;
        sendPhoto: (args: { botToken: string; chatId: string; dataUrl: string; caption?: string }) => Promise<{
          ok: boolean;
          result?: any;
          error?: string;
        }>;
        answerCallback: (args: { botToken: string; callbackId: string; text?: string }) => Promise<{
          ok: boolean;
          result?: any;
          error?: string;
        }>;
        startPolling: (args: { botToken: string; chatId: string | string[]; drain?: boolean; offset?: number }) => Promise<{
          ok: boolean;
          chatIds?: string[];
          error?: string;
        }>;
        stopPolling: () => Promise<{ ok: boolean; error?: string }>;
        onUpdate: (handler: (payload: any) => void) => () => void;
      };
      getLastCaptureError?: () => string | null;
      live?: {
        connect: (opts: any) => void;
        sendAudio: (b64: string) => void;
        sendImage: (opts: { mimeType?: string; data: string; text?: string }) => void;
        sendEvent: (evt: any) => void;
        close: () => void;
        on: (event: string, handler: (payload: any) => void) => () => void;
      };
      mt5?: {
        startBridge: () => Promise<{ ok: boolean; port?: number; healthy?: boolean | null; started?: boolean; error?: string }>;
        getBridgeStatus: () => Promise<{ ok: boolean; port?: number; healthy?: boolean; lastError?: string | null }>;
        openBridgeLog: () => Promise<{ ok: boolean; logPath?: string }>;
      };
      broker?: {
        list: () => Promise<{
          ok: boolean;
          brokers?: Array<{
            id: string;
            label?: string;
            kind?: string;
            capabilities?: Record<string, any>;
            active?: boolean;
          }>;
          error?: string;
        }>;
        getActive: () => Promise<{ ok: boolean; activeId?: string | null; error?: string }>;
        setActive: (brokerId: string) => Promise<{ ok: boolean; activeId?: string; error?: string }>;
        request: (args: { brokerId?: string; method: string; args?: any }) => Promise<any>;
      };
      openai?: {
        responses: (args: { body: any }) => Promise<{ ok: boolean; status?: number; data?: any; error?: string; requestId?: string | null }>;
        images: (args: { body: any }) => Promise<{ ok: boolean; status?: number; data?: any; error?: string; requestId?: string | null }>;
        responsesStream: (args: { body: any; streamId?: string }) => Promise<{ ok: boolean; status?: number; data?: any; error?: string; requestId?: string | null; streamId?: string }>;
        onStreamEvent: (handler: (payload: { streamId: string; event: any }) => void) => () => void;
      };
      secrets?: {
        getStatus: () => Promise<{
          ok: boolean;
          encryptionAvailable?: boolean;
          openai?: { hasKey?: boolean };
          gemini?: { hasKey?: boolean };
          error?: string;
        }>;
        setOpenAIKey: (args: { key: string }) => Promise<{ ok: boolean; saved?: boolean; cleared?: boolean; error?: string }>;
        clearOpenAIKey: () => Promise<{ ok: boolean; cleared?: boolean; error?: string }>;
        setGeminiKey: (args: { key: string }) => Promise<{ ok: boolean; saved?: boolean; cleared?: boolean; error?: string }>;
        clearGeminiKey: () => Promise<{ ok: boolean; cleared?: boolean; error?: string }>;
      };
      gemini?: {
        tts: (args: { text: string; voiceName?: string }) => Promise<{ ok: boolean; data?: string; error?: string }>;
      };
      tradelocker?: {
        getSavedConfig: () => Promise<{
          ok: boolean;
          env: 'demo' | 'live';
          server: string;
          email: string;
          autoConnect?: boolean;
          accountId: number | null;
          accNum: number | null;
          tradingEnabled: boolean;
          autoPilotEnabled: boolean;
          defaultOrderQty: number;
          defaultOrderType: 'market' | 'limit' | 'stop';
          streamingEnabled?: boolean;
          streamingUrl?: string;
          streamingAutoReconnect?: boolean;
          streamingSubscribe?: string;
          debug?: {
            enabled?: boolean;
            maxBytes?: number;
            maxFiles?: number;
            textLimit?: number;
          };
          hasSavedPassword: boolean;
          hasSavedDeveloperApiKey: boolean;
          encryptionAvailable: boolean;
        }>;
        updateSavedConfig: (patch: any) => Promise<{ ok: boolean; path?: string; error?: string }>;
        clearSavedSecrets: () => Promise<{ ok: boolean; path?: string; error?: string }>;
        connect: (opts: any) => Promise<{ ok: boolean; error?: string }>;
        disconnect: () => Promise<{ ok: boolean }>;
        getStatus: () => Promise<{
          ok: boolean;
          connected: boolean;
          env?: 'demo' | 'live';
          server?: string | null;
          email?: string | null;
          accountId?: number | null;
          accNum?: number | null;
          tradingEnabled?: boolean;
          autoPilotEnabled?: boolean;
          hasSavedPassword?: boolean;
          hasSavedDeveloperApiKey?: boolean;
          lastError?: string | null;
          rateLimitedUntilMs?: number;
          upstreamBackoffUntilMs?: number;
          upstreamLastError?: string | null;
          upstreamLastStatus?: number | null;
          requestQueueDepth?: number;
          requestQueueMaxDepth?: number;
          requestQueueMaxWaitMs?: number;
          requestInFlight?: number;
          requestConcurrency?: number;
          minRequestIntervalMs?: number;
          rateLimitPolicy?: 'safe' | 'balanced' | 'aggressive';
          rateLimitPolicies?: Array<'safe' | 'balanced' | 'aggressive'>;
          rateLimitTelemetry?: any;
        }>;
        getRateLimitPolicy: () => Promise<{
          ok: boolean;
          policy?: 'safe' | 'balanced' | 'aggressive';
          profile?: Record<string, number>;
          availablePolicies?: Array<'safe' | 'balanced' | 'aggressive'>;
          error?: string;
        }>;
        setRateLimitPolicy: (args: {
          policy?: 'safe' | 'balanced' | 'aggressive';
        }) => Promise<{
          ok: boolean;
          policy?: 'safe' | 'balanced' | 'aggressive';
          profile?: Record<string, number>;
          availablePolicies?: Array<'safe' | 'balanced' | 'aggressive'>;
          error?: string;
        }>;
        getAccounts: () => Promise<{ ok: boolean; accounts: any[]; error?: string }>;
        setActiveAccount: (account: { accountId: number; accNum: number }) => Promise<{ ok: boolean; accountId?: number | null; accNum?: number | null }>;
        setTradingOptions: (options: any) => Promise<{ ok: boolean; path?: string; error?: string }>;
        searchInstruments: (args: { query: string; limit?: number }) => Promise<{
          ok: boolean;
          results: Array<{ tradableInstrumentId: number | null; symbol: string; displayName: string | null }>;
          error?: string;
        }>;
        getSnapshot: (opts?: { includeOrders?: boolean }) => Promise<{
          ok: boolean;
          balance?: number;
          equity?: number;
          positions?: any[];
          orders?: any[] | null;
          ordersError?: string | null;
          rateLimited?: boolean;
          retryAtMs?: number;
          cached?: boolean;
          error?: string;
        }>;
        getAccountMetrics: (opts?: { maxAgeMs?: number }) => Promise<{
          ok: boolean;
          accountId?: number | null;
          accNum?: number | null;
          currency?: string | null;
          balance?: number;
          equity?: number;
          openGrossPnl?: number | null;
          openNetPnl?: number | null;
          marginUsed?: number | null;
          marginFree?: number | null;
          marginLevel?: number | null;
          computedMarginLevel?: boolean;
          updatedAtMs?: number;
          cached?: boolean;
          rateLimited?: boolean;
          retryAtMs?: number;
          error?: string;
        }>;
        getOrders: () => Promise<{ ok: boolean; orders?: any[]; error?: string; rateLimited?: boolean; retryAtMs?: number }>;
        getOrdersHistory: () => Promise<{ ok: boolean; orders?: any[]; error?: string; rateLimited?: boolean; retryAtMs?: number }>;
        getOrderDetails: (args: { orderId: string | number }) => Promise<{
          ok: boolean;
          orderId?: string;
          symbol?: string;
          side?: string;
          type?: string;
          qty?: number;
          price?: number;
          stopLoss?: number;
          takeProfit?: number;
          status?: string;
          createdAt?: string | null;
          strategyId?: string | null;
          filledQty?: number | null;
          remainingQty?: number | null;
          rejectReason?: string | null;
          raw?: any;
          rateLimited?: boolean;
          retryAtMs?: number;
          error?: string;
        }>;
        getPositionDetails: (args: { positionId: string | number }) => Promise<{
          ok: boolean;
          positionId?: string;
          symbol?: string;
          side?: string;
          entryPrice?: number;
          size?: number;
          openTime?: string | null;
          closeTime?: string | null;
          closePrice?: number | null;
          realizedPnl?: number | null;
          commission?: number | null;
          swap?: number | null;
          fee?: number | null;
          raw?: any;
          rateLimited?: boolean;
          retryAtMs?: number;
          error?: string;
        }>;
        getQuote: (args: {
          symbol?: string;
          tradableInstrumentId?: number | string;
          routeId?: number | string;
          maxAgeMs?: number;
        }) => Promise<{
          ok: boolean;
          quote?: {
            bid?: number | null;
            ask?: number | null;
            mid?: number | null;
            last?: number | null;
            bidSize?: number | null;
            askSize?: number | null;
            spread?: number | null;
            timestampMs?: number | null;
          };
          symbol?: string | null;
          tradableInstrumentId?: number;
          routeId?: number;
          fetchedAtMs?: number;
          cached?: boolean;
          rateLimited?: boolean;
          retryAtMs?: number;
          code?: string;
          error?: string;
        }>;
        getQuotes: (args: {
          symbols?: string[] | string;
          tradableInstrumentIds?: Array<number | string> | number | string;
          maxAgeMs?: number;
        }) => Promise<{
          ok: boolean;
          quotes?: any[];
          errors?: string[];
          rateLimited?: boolean;
          retryAtMs?: number;
          code?: string;
          error?: string;
        }>;
        getHistory: (args: {
          symbol?: string;
          tradableInstrumentId?: number | string;
          routeId?: number | string;
          resolution?: string;
          from?: number | string | Date;
          to?: number | string | Date;
          lookback?: string;
          maxBarsPerRequest?: number;
          maxAgeMs?: number;
        }) => Promise<{
          ok: boolean;
          bars?: any[];
          symbol?: string | null;
          tradableInstrumentId?: number;
          routeId?: number;
          resolution?: string;
          from?: number;
          to?: number;
          fetchedAtMs?: number;
          cached?: boolean;
          rateLimited?: boolean;
          retryAtMs?: number;
          code?: string;
          error?: string;
        }>;
        getHistorySeries: (args: {
          symbol?: string;
          tradableInstrumentId?: number | string;
          resolution?: string;
          from?: number | string | Date;
          to?: number | string | Date;
          lookback?: string;
          maxBarsPerRequest?: number;
          maxAgeMs?: number;
          aggregate?: boolean;
        }) => Promise<{
          ok: boolean;
          bars?: any[];
          symbol?: string | null;
          tradableInstrumentId?: number;
          resolution?: string;
          from?: number;
          to?: number;
          fetchedAtMs?: number;
          source?: string;
          coverage?: {
            expectedBars?: number;
            missingBars?: number;
            gapCount?: number;
            maxGapMs?: number | null;
            coveragePct?: number | null;
            firstTs?: number | null;
            lastTs?: number | null;
          };
          rateLimited?: boolean;
          retryAtMs?: number;
          code?: string;
          error?: string;
        }>;
        getDailyBar: (args: {
          symbol?: string;
          tradableInstrumentId?: number | string;
          routeId?: number | string;
          barType?: string;
          maxAgeMs?: number;
        }) => Promise<{
          ok: boolean;
          bar?: {
            open?: number | null;
            high?: number | null;
            low?: number | null;
            close?: number | null;
            volume?: number | null;
          };
          symbol?: string | null;
          tradableInstrumentId?: number;
          routeId?: number;
          barType?: string;
          fetchedAtMs?: number;
          cached?: boolean;
          rateLimited?: boolean;
          retryAtMs?: number;
          code?: string;
          error?: string;
        }>;
        getInstrumentConstraints: (args: {
          symbol?: string;
          tradableInstrumentId?: number | string;
        }) => Promise<{
          ok: boolean;
          symbol?: string | null;
          tradableInstrumentId?: number | null;
          constraints?: {
            minStopDistance?: number | null;
            priceStep?: number | null;
            sessionOpen?: boolean | null;
            sessionStatus?: any;
          };
          fetchedAtMs?: number;
          error?: string;
        }>;
        getInstrumentDetails: (args: { tradableInstrumentId?: number | string; symbol?: string }) => Promise<{
          ok: boolean;
          instrument?: any;
          error?: string;
        }>;
        getSessionDetails: (args: { sessionId?: number | string }) => Promise<{
          ok: boolean;
          session?: any;
          error?: string;
        }>;
        getSessionStatus: (args: { sessionStatusId?: number | string }) => Promise<{
          ok: boolean;
          status?: any;
          error?: string;
        }>;
        getStreamStatus?: () => Promise<{
          ok: boolean;
          enabled?: boolean;
          status?: string;
          url?: string | null;
          lastError?: string | null;
          lastMessageAtMs?: number | null;
        }>;
        startStream?: () => Promise<{ ok: boolean; status?: string; error?: string }>;
        stopStream?: () => Promise<{ ok: boolean; status?: string; error?: string }>;
        onStreamEvent?: (handler: (payload: any) => void) => () => void;
        cancelOrder: (args: { orderId: string | number }) => Promise<{ ok: boolean; error?: string; response?: any }>;
        closePosition: (args: { positionId: string; qty?: number }) => Promise<{ ok: boolean; error?: string; response?: any }>;
        modifyOrder: (args: {
          orderId: string | number;
          price?: number | null;
          qty?: number | null;
          stopLoss?: number | null;
          takeProfit?: number | null;
          strategyId?: string | number | null;
        }) => Promise<{ ok: boolean; error?: string; response?: any }>;
        modifyPosition: (args: {
          positionId: string | number;
          stopLoss?: number | null;
          takeProfit?: number | null;
          trailingOffset?: number | null;
          strategyId?: string | number | null;
        }) => Promise<{ ok: boolean; error?: string; response?: any }>;
        placeOrder: (args: any) => Promise<{
          ok: boolean;
          orderId?: string | null;
          orderStatus?: string | null;
          filledQty?: number | null;
          remainingQty?: number | null;
          positionId?: string | null;
          qty?: number;
          requestedQty?: number;
          normalizedQty?: number | null;
          minQty?: number | null;
          qtyStep?: number | null;
          qtyPrecision?: number | null;
          resolvedSymbol?: string | null;
          retryAfterMs?: number;
          code?: string;
          error?: string;
          response?: any;
        }>;
      };
      codebase?: {
        listFiles: (args?: { root?: string; extensions?: string[]; maxResults?: number; includeAll?: boolean }) => Promise<{
          ok: boolean;
          files?: string[];
          truncated?: boolean;
          error?: string;
        }>;
        search: (args: {
          query: string;
          regex?: boolean;
          caseSensitive?: boolean;
          contextLines?: number;
          maxResults?: number;
          root?: string;
          extensions?: string[];
          includeAll?: boolean;
          maxFileBytes?: number;
          maxFileResults?: number;
        }) => Promise<{
          ok: boolean;
          matches?: Array<{ path: string; line: number; column: number; preview: string }>;
          truncated?: boolean;
          fileCount?: number;
          error?: string;
        }>;
        readFile: (args: {
          path: string;
          startLine?: number;
          endLine?: number;
          maxLines?: number;
          root?: string;
          fullFile?: boolean;
        }) => Promise<{
          ok: boolean;
          path?: string;
          content?: string;
          startLine?: number;
          endLine?: number;
          totalLines?: number;
          error?: string;
        }>;
        traceDataflow: (args: {
          source?: string;
          sink?: string;
          maxResults?: number;
          root?: string;
          extensions?: string[];
          includeAll?: boolean;
        }) => Promise<{
          ok: boolean;
          source?: string;
          sink?: string;
          sourceMatches?: any[];
          sinkMatches?: any[];
          overlap?: string[];
          truncated?: boolean;
          error?: string;
        }>;
      };
      agentRunner?: {
        evaluateSignal: (input: any) => Promise<{
          ok: boolean;
          text?: string;
          proposal?: any;
          sessionId?: string;
          error?: string;
          code?: string;
        }>;
        getStatus: () => Promise<{
          ok: boolean;
          activeSymbols?: string[];
          activeSessions?: Array<{
            sessionId: string;
            agentId?: string | null;
            symbol?: string | null;
            startedAtMs?: number | null;
          }>;
          lastRunAtMs?: number | null;
          error?: string;
        }>;
        cancel: (input: { sessionId?: string; symbol?: string }) => Promise<{
          ok: boolean;
          canceled?: string[];
          canceledCount?: number;
          error?: string;
        }>;
      };
      tradeLedger?: {
        append: (entry: any) => Promise<{ ok: boolean; entry?: any; error?: string; path?: string }>;
        reserve: (args: { dedupeKey: string; windowMs?: number; entry?: any }) => Promise<{ ok: boolean; reserved?: boolean; entry?: any; error?: string; path?: string }>;
        update: (args: { id: string; patch: any }) => Promise<{ ok: boolean; entry?: any; error?: string; path?: string }>;
        list: (args?: { limit?: number }) => Promise<{ ok: boolean; entries?: any[]; error?: string; path?: string }>;
        listEvents: (args?: {
          limit?: number;
          kind?: string;
          eventType?: string;
          symbol?: string;
          runId?: string;
          actionId?: string;
          decisionId?: string;
          executionId?: string;
          brokerResponseId?: string;
          status?: string;
          source?: string;
        }) => Promise<{ ok: boolean; entries?: any[]; error?: string; path?: string }>;
        findRecent: (args: { dedupeKey: string; windowMs?: number; brokers?: string[] }) => Promise<{ ok: boolean; found?: boolean; entry?: any; error?: string; path?: string }>;
        addMemory: (memory: any) => Promise<{ ok: boolean; memory?: any; error?: string; path?: string }>;
        listMemories: (args?: { limit?: number }) => Promise<{ ok: boolean; memories?: any[]; error?: string; path?: string }>;
        updateMemory: (args: { id: string; patch: any }) => Promise<{ ok: boolean; memory?: any; error?: string; path?: string }>;
        deleteMemory: (args: { id: string }) => Promise<{ ok: boolean; memory?: any; error?: string; path?: string }>;
        clearMemories: () => Promise<{ ok: boolean; error?: string; path?: string }>;
        upsertAgentMemory: (memory: any) => Promise<{ ok: boolean; memory?: any; error?: string; path?: string }>;
        getAgentMemory: (args: { key?: string; id?: string; touch?: boolean }) => Promise<{ ok: boolean; memory?: any; error?: string; path?: string }>;
        listAgentMemory: (args?: {
          limit?: number;
          symbol?: string;
          timeframe?: string;
          kind?: string;
          tags?: string[];
          agentId?: string;
          scope?: string | string[];
          category?: string;
          subcategory?: string;
        }) => Promise<{ ok: boolean; memories?: any[]; error?: string; path?: string }>;
        deleteAgentMemory: (args: { key?: string; id?: string }) => Promise<{ ok: boolean; memory?: any; error?: string; path?: string }>;
        clearAgentMemory: () => Promise<{ ok: boolean; error?: string; path?: string }>;
        getOptimizerEvalCache: (args: { key: string; touch?: boolean }) => Promise<{
          ok: boolean;
          entry?: {
            key?: string | null;
            payload?: any;
            createdAtMs?: number | null;
            updatedAtMs?: number | null;
            expiresAtMs?: number | null;
            engineVersion?: string | null;
          } | null;
          expired?: boolean;
          error?: string;
          path?: string;
        }>;
        putOptimizerEvalCache: (args: { key: string; payload: any; engineVersion?: string | null; expiresAtMs?: number | null }) => Promise<{
          ok: boolean;
          error?: string;
          path?: string;
        }>;
        pruneOptimizerEvalCache: (args?: { maxEntries?: number }) => Promise<{ ok: boolean; error?: string; path?: string }>;
        createExperimentNote: (note: any) => Promise<{ ok: boolean; note?: any; error?: string; path?: string }>;
        getExperimentNote: (args: { id: string }) => Promise<{ ok: boolean; note?: any; error?: string; path?: string }>;
        listExperimentNotes: (args?: { limit?: number; symbol?: string; timeframe?: string; strategy?: string; tags?: string[] }) => Promise<{
          ok: boolean;
          notes?: any[];
          error?: string;
          path?: string;
        }>;
        createOptimizerWinner: (args: any) => Promise<{ ok: boolean; winner?: any; error?: string; path?: string }>;
        getOptimizerWinner: (args: { id: string }) => Promise<{ ok: boolean; winner?: any; error?: string; path?: string }>;
        getOptimizerWinnerBySessionRound: (args: { sessionId: string; round: number }) => Promise<{ ok: boolean; winner?: any; error?: string; path?: string }>;
        listOptimizerWinners: (args?: { limit?: number; sessionId?: string; symbol?: string; timeframe?: string; strategy?: string; round?: number }) => Promise<{
          ok: boolean;
          winners?: any[];
          error?: string;
          path?: string;
        }>;
        createResearchSession: (args: any) => Promise<{ ok: boolean; session?: any; error?: string; path?: string }>;
        getResearchSession: (args: { sessionId: string }) => Promise<{ ok: boolean; session?: any; error?: string; path?: string }>;
        listResearchSessions: (args?: { limit?: number; symbol?: string; timeframe?: string; strategy?: string; status?: string }) => Promise<{
          ok: boolean;
          sessions?: any[];
          error?: string;
          path?: string;
        }>;
        appendResearchStep: (args: { sessionId: string; stepIndex?: number; kind?: string; payload?: any }) => Promise<{ ok: boolean; step?: any; error?: string; path?: string }>;
        listResearchSteps: (args: { sessionId: string; limit?: number }) => Promise<{ ok: boolean; steps?: any[]; error?: string; path?: string }>;
        createPlaybookRun: (args: any) => Promise<{ ok: boolean; run?: any; error?: string; path?: string }>;
        getPlaybookRun: (args: { runId: string }) => Promise<{ ok: boolean; run?: any; error?: string; path?: string }>;
        listPlaybookRuns: (args?: { limit?: number; status?: string; playbookId?: string; symbol?: string; timeframe?: string; strategy?: string }) => Promise<{
          ok: boolean;
          runs?: any[];
          error?: string;
          path?: string;
        }>;
        stats: () => Promise<{
          ok: boolean;
          path?: string;
          stateVersion?: number;
          persistedVersion?: number;
          pendingWrites?: number;
          entriesCount?: number;
          memoriesCount?: number;
          agentMemoryCount?: number;
          experimentCount?: number;
          researchSessionCount?: number;
          researchStepCount?: number;
          playbookRunCount?: number;
          persistDelayMs?: number;
          inFlight?: boolean;
          lastDirtyAtMs?: number | null;
          lastPersistAtMs?: number | null;
          lastError?: string | null;
          error?: string;
        }>;
        flush: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      };
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: any;
    }
  }
}
