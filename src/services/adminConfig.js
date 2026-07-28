const fs = require('fs');

const DEFAULT_PUBLIC_CONFIG = {
  assistantName: 'Qjo',
  tagline: 'ذكاء واضح بتجربة راقية',
  welcomeTitle: 'كيف يمكنني مساعدتك اليوم؟',
  welcomeText: 'اسأل، اكتب، خطط، تعلّم، أو ابنِ شيئًا جديدًا. Qjo مصمم ليعطيك إجابات واضحة وعملية بدون تعقيد.',
  suggestions: [
    { title: 'اقترح فكرة مشروع', text: 'أفكار عملية قابلة للتنفيذ مع خطوات بداية واضحة.', prompt: 'اكتب لي فكرة مشروع بسيطة ومربحة' },
    { title: 'نظّم يومي', text: 'خطة مختصرة تساعدك ترتب الأولويات بسرعة.', prompt: 'ساعدني أرتب يومي بخطة مختصرة' },
    { title: 'اشرح مفهومًا', text: 'شرح واضح وبسيط لأي موضوع تريد فهمه.', prompt: 'اشرح لي الذكاء الاصطناعي ببساطة' }
  ],
  globalTraining: ''
};

function createAdminConfigService(configPath) {
  if (!configPath) throw new Error('createAdminConfigService requires configPath');

  function readAdminConfig() {
    try {
      if (!fs.existsSync(configPath)) return DEFAULT_PUBLIC_CONFIG;
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_PUBLIC_CONFIG, ...parsed };
    } catch (_) {
      return DEFAULT_PUBLIC_CONFIG;
    }
  }

  function writeAdminConfig(config) {
    const safe = {
      assistantName: String(config.assistantName || 'Qjo').slice(0, 40),
      tagline: String(config.tagline || '').slice(0, 140),
      welcomeTitle: String(config.welcomeTitle || '').slice(0, 120),
      welcomeText: String(config.welcomeText || '').slice(0, 320),
      suggestions: Array.isArray(config.suggestions) ? config.suggestions.slice(0, 6).map(s => ({
        title: String(s.title || '').slice(0, 80),
        text: String(s.text || '').slice(0, 160),
        prompt: String(s.prompt || '').slice(0, 300)
      })) : DEFAULT_PUBLIC_CONFIG.suggestions,
      globalTraining: String(config.globalTraining || '').slice(0, 20000)
    };
    fs.writeFileSync(configPath, JSON.stringify(safe, null, 2));
    return safe;
  }

  return { readAdminConfig, writeAdminConfig, DEFAULT_PUBLIC_CONFIG };
}

module.exports = { createAdminConfigService, DEFAULT_PUBLIC_CONFIG };
