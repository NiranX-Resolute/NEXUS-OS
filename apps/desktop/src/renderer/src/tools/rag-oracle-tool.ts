async function getSecretFromVault(keyName: string): Promise<string> {
  try {
    // Security Migration: Purge any legacy key off browser localStorage to Windows DPAPI vault
    if (typeof window !== 'undefined' && window.localStorage) {
      const legacyCustomKey = window.localStorage.getItem('nexus_custom_api_key')
      if (legacyCustomKey) {
        if ((window as any).nexusAuth?.setVaultSecret) {
          await (window as any).nexusAuth.setVaultSecret('NEXUS_CUSTOM_API_KEY', legacyCustomKey)
        } else if (window.electron?.ipcRenderer) {
          await window.electron.ipcRenderer.invoke('set-vault-secret', {
            key: 'NEXUS_CUSTOM_API_KEY',
            value: legacyCustomKey
          })
        }
        window.localStorage.removeItem('nexus_custom_api_key')
      }
    }

    if ((window as any).nexusAuth?.getVaultSecret) {
      const res = await (window as any).nexusAuth.getVaultSecret(keyName)
      if (res && res.success && res.value) return res.value
      if (typeof res === 'string' && res) return res
    }

    if (window.electron?.ipcRenderer) {
      const res = await window.electron.ipcRenderer.invoke('get-vault-secret', keyName)
      if (res && res.success && res.value) return res.value
      const secureKeys = await window.electron.ipcRenderer.invoke('secure-get-keys')
      if (keyName === 'GEMINI_API_KEY' && secureKeys?.geminiKey) return secureKeys.geminiKey
      if (keyName === 'GROQ_API_KEY' && secureKeys?.groqKey) return secureKeys.groqKey
      if (keyName === 'NEXUS_CUSTOM_API_KEY' && secureKeys?.customApiKey) return secureKeys.customApiKey
    }
  } catch {}
  return ''
}

export const getCustomApiKey = async (): Promise<string> => {
  return await getSecretFromVault('NEXUS_CUSTOM_API_KEY')
}

export const saveCustomApiKeyToVault = async (apiKey: string): Promise<boolean> => {
  try {
    // Explicitly purge from localStorage to prevent plaintext credential leakage
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('nexus_custom_api_key')
    }
    if ((window as any).nexusAuth?.setVaultSecret) {
      const res = await (window as any).nexusAuth.setVaultSecret('NEXUS_CUSTOM_API_KEY', apiKey)
      if (res?.success || res === true) return true
    }
    if (window.electron?.ipcRenderer) {
      const res = await window.electron.ipcRenderer.invoke('set-vault-secret', {
        key: 'NEXUS_CUSTOM_API_KEY',
        value: apiKey
      })
      return Boolean(res?.success)
    }
    return false
  } catch {
    return false
  }
}

export const ingestCodebase = async (dirPath: string): Promise<string> => {
  try {
    const geminiKey = await getSecretFromVault('GEMINI_API_KEY')

    if (!geminiKey.trim()) {
      throw new Error('Missing Gemini API Key. Please update it in the DPAPI Vault.')
    }

    window.dispatchEvent(new CustomEvent('oracle-ingest-start', { detail: { path: dirPath } }))

    const cleanupListener = window.electron.ipcRenderer.on(
      'oracle-progress',
      (_ipcEvent: any, data: any) => {
        const payload = data || _ipcEvent
        window.dispatchEvent(new CustomEvent('oracle-progress', { detail: payload }))
      }
    )

    const result = await window.electron.ipcRenderer.invoke('ingest-codebase', {
      dirPath,
      geminiKey
    })

    if (typeof cleanupListener === 'function') cleanupListener()

    if (result.success) {
      window.dispatchEvent(
        new CustomEvent('oracle-ingest-done', { detail: { chunks: result.totalChunks } })
      )
      const msg = result.wasResumed
        ? `✅ Successfully resumed and completed ingestion. Memory Banks fully loaded.`
        : `✅ Successfully ingested directory. Generated ${result.totalChunks} vectors.`
      return msg
    }
    return `❌ Ingestion Aborted or Failed: ${result.error}`
  } catch (error) {
    return `❌ System failure: ${String(error)}`
  }
}

export const consultOracle = async (query: string): Promise<string> => {
  try {
    const geminiKey = await getSecretFromVault('GEMINI_API_KEY')
    const groqKey = await getSecretFromVault('GROQ_API_KEY')

    if (!geminiKey.trim() || !groqKey.trim()) {
      throw new Error(
        'Missing Gemini or Groq API Keys. Please configure them in the DPAPI Vault.'
      )
    }

    window.dispatchEvent(new CustomEvent('oracle-thinking'))

    const result = await window.electron.ipcRenderer.invoke('consult-oracle', {
      query,
      geminiKey,
      groqKey
    })

    if (result.success) {
      window.dispatchEvent(
        new CustomEvent('oracle-answered', { detail: { answer: result.answer } })
      )
      return `Code Analysis:\n${result.answer}`
    }
    return `❌ AI failed: ${result.error}`
  } catch (error) {
    return `❌ System failure: ${String(error)}`
  }
}

export const cancelIngestion = async (): Promise<void> => {
  await window.electron.ipcRenderer.invoke('cancel-ingestion')
}
