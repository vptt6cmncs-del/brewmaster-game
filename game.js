// ===== 游戏主逻辑 =====

const game = {
  // 游戏状态
  state: {
    currentPage: 'cover',
    currentMode: null, // 'apprentice', 'exam', 'free', null=经典模式
    selectedFamily: null,
    selectedStyle: null,
    brewer: null,
    step: 0,
    
    // 糖化
    selectedMalts: [],
    mashTemp: 65,
    mashTime: 60,
    
    // 煮沸
    selectedHops: [],
    boilTime: 60,
    
    // 发酵
    selectedYeast: '',
    fermentTemp: 18,
    fermentTime: 14,
    
    // 增味
    selectedFlavors: [],
    conditionTime: 7,
    
    // 结果
    result: null,
    
    // 考试模式状态
    exam: {
      level: 1,
      streak: 0,
      bestStreak: 0,
      currentQuestion: null,
      questionCount: 0
    },
    
    // 自由酿造
    freeStyle: null
  },
  
  // ===== 模式选择 =====
  selectMode(mode) {
    this.state.currentMode = mode;
    
    if (mode === 'apprentice') {
      this.toPage('apprentice');
      UI.renderApprenticeMode();
    } else if (mode === 'exam') {
      this.toPage('exam');
      this.loadExamStats();
    } else if (mode === 'free') {
      this.toPage('free');
      UI.renderFreeMode();
    }
  },
  
  // ===== 页面切换 =====
  toPage(pageId) {
    // 播放页面切换音效
    Sound.playClick();
    
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // 显示目标页面
    const target = document.getElementById(`page-${pageId}`);
    if (target) {
      target.classList.add('active');
      this.state.currentPage = pageId;
    }
    
    // 页面特定初始化
    if (pageId === 'style-select') {
      UI.renderStyleGrid();
    } else if (pageId === 'gallery') {
      UI.renderGallery();
    } else if (pageId === 'brewing') {
      this.initBrewing();
    } else if (pageId === 'apprentice') {
      UI.renderApprenticeMode();
    } else if (pageId === 'exam') {
      this.loadExamStats();
    } else if (pageId === 'free') {
      UI.renderFreeMode();
    }
    
    // 滚动到顶部
    window.scrollTo(0, 0);
  },
  
  // ===== 学徒模式 =====
  getApprenticeProgress() {
    const unlocked = JSON.parse(localStorage.getItem('brewmaster_unlocked') || '[]');
    const completed = JSON.parse(localStorage.getItem('brewmaster_completed') || '[]');
    
    // 所有风格按难度排序
    const allStyles = [];
    const difficultyOrder = ['american', 'german', 'czech', 'british', 'belgian', 'sour'];
    
    difficultyOrder.forEach(family => {
      const fam = BJCP_STYLES[family];
      if (fam) {
        fam.styles.forEach((style, idx) => {
          allStyles.push({
            family,
            style,
            difficulty: difficultyOrder.indexOf(family),
            index: allStyles.length
          });
        });
      }
    });
    
    return { allStyles, unlocked, completed };
  },
  
  unlockStyle(styleId) {
    const unlocked = JSON.parse(localStorage.getItem('brewmaster_unlocked') || '[]');
    if (!unlocked.includes(styleId)) {
      unlocked.push(styleId);
      localStorage.setItem('brewmaster_unlocked', JSON.stringify(unlocked));
    }
  },
  
  completeStyle(styleId, score) {
    const completed = JSON.parse(localStorage.getItem('brewmaster_completed') || '[]');
    const existing = completed.find(c => c.styleId === styleId);
    if (existing) {
      if (score > existing.score) existing.score = score;
    } else {
      completed.push({ styleId, score, date: new Date().toISOString() });
    }
    localStorage.setItem('brewmaster_completed', JSON.stringify(completed));
    
    // 解锁下一个
    const { allStyles } = this.getApprenticeProgress();
    const currentIdx = allStyles.findIndex(s => s.style.id === styleId);
    if (currentIdx >= 0 && currentIdx < allStyles.length - 1) {
      const next = allStyles[currentIdx + 1];
      this.unlockStyle(next.style.id);
    }
  },
  
  startApprenticeBrew(family, style) {
    this.state.selectedFamily = family;
    this.state.selectedStyle = style;
    this.state.currentMode = 'apprentice';
    
    // 使用对应流派的酿酒师
    const famData = BJCP_STYLES[family];
    this.state.brewer = famData?.brewer || { name: '酿酒师', avatar: '🍺', catchphrase: '开始酿造吧！' };
    
    this.state.step = 0;
    this.resetBrewState();
    this.toPage('brewing');
  },
  
  // ===== BJCP考试模式 =====
  loadExamStats() {
    const stats = JSON.parse(localStorage.getItem('brewmaster_exam') || '{"level":1,"bestStreak":0}');
    this.state.exam.level = stats.level || 1;
    this.state.exam.bestStreak = stats.bestStreak || 0;
    this.state.exam.streak = 0;
    
    document.getElementById('exam-level').textContent = this.state.exam.level;
    document.getElementById('exam-streak').textContent = 0;
    document.getElementById('exam-best').textContent = this.state.exam.bestStreak;
  },
  
  saveExamStats() {
    localStorage.setItem('brewmaster_exam', JSON.stringify({
      level: this.state.exam.level,
      bestStreak: this.state.exam.bestStreak
    }));
  },
  
  startExam() {
    Sound.playClick();
    this.state.exam.questionCount = 0;
    this.state.exam.streak = 0;
    this.nextExamQuestion();
  },
  
  nextExamQuestion() {
    Sound.playClick();
    const { allStyles } = this.getApprenticeProgress();
    if (allStyles.length === 0) return;
    
    // 根据等级选择难度
    const level = this.state.exam.level;
    const poolSize = Math.min(3 + level, allStyles.length);
    const pool = allStyles.slice(0, poolSize);
    
    // 随机选1个正确答案
    const correct = pool[Math.floor(Math.random() * pool.length)];
    
    // 生成3个干扰项（不同风格）
    const distractors = [];
    const used = new Set([correct.style.id]);
    while (distractors.length < 3) {
      const candidate = allStyles[Math.floor(Math.random() * allStyles.length)];
      if (!used.has(candidate.style.id)) {
        used.add(candidate.style.id);
        distractors.push(candidate);
      }
    }
    
    // 组合并打乱
    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
    
    this.state.exam.currentQuestion = { correct, options };
    this.state.exam.questionCount++;
    
    // 显示题目
    document.getElementById('exam-intro').style.display = 'none';
    document.getElementById('exam-question').style.display = 'block';
    document.getElementById('question-number').textContent = `第 ${this.state.exam.questionCount} 题`;
    document.getElementById('btn-next-question').style.display = 'none';
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-feedback').className = 'exam-feedback';
    
    // 显示线索
    const style = correct.style;
    const paramsEl = document.getElementById('clue-params');
    paramsEl.innerHTML = `
      <span class="clue-param">OG ${style.og.min}-${style.og.max}</span>
      <span class="clue-param">IBU ${style.ibu.min}-${style.ibu.max}</span>
      <span class="clue-param">ABV ${style.abv.min}-${style.abv.max}%</span>
      <span class="clue-param">SRM ${style.srm.min}-${style.srm.max}</span>
    `;
    
    // 生成描述线索（去掉风格名称）
    let desc = style.description;
    // 随机隐藏一些信息
    const hints = [
      `这款啤酒的${style.og.min > 1.06 ? '酒精度较高' : style.og.min < 1.04 ? '酒精度较低' : '酒精度适中'}。`,
      `苦度范围在${style.ibu.min}-${style.ibu.max} IBU之间。`,
      `颜色为${BrewLogic.srmToColorName((style.srm.min + style.srm.max) / 2)}。`,
      `主要使用${style.yeasts[0]?.name || '特定酵母'}发酵。`,
      `适合在${style.fermentTemp.min}-${style.fermentTemp.max}°C下发酵。`
    ];
    // 随机选2-3个提示
    const selectedHints = hints.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    document.getElementById('clue-desc').innerHTML = selectedHints.join('<br>');
    
    // 显示选项
    const optionsEl = document.getElementById('answer-options');
    optionsEl.innerHTML = '';
    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.innerHTML = `<strong>${opt.style.name}</strong><br><span style="font-size:12px;color:rgba(255,248,225,0.6)">${opt.style.nameEn}</span>`;
      btn.onclick = () => this.answerExam(idx);
      optionsEl.appendChild(btn);
    });
    
    window.scrollTo(0, 0);
  },
  
  answerExam(selectedIdx) {
    const question = this.state.exam.currentQuestion;
    if (!question) return;
    
    const correctIdx = question.options.findIndex(o => o.style.id === question.correct.style.id);
    const isCorrect = selectedIdx === correctIdx;
    
    // 禁用所有按钮
    document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
      btn.classList.add('disabled');
      if (idx === correctIdx) btn.classList.add('correct');
      else if (idx === selectedIdx && !isCorrect) btn.classList.add('wrong');
    });
    
    // 显示反馈
    const feedback = document.getElementById('exam-feedback');
    feedback.style.display = 'block';
    
    if (isCorrect) {
      Sound.playSuccess();
      this.state.exam.streak++;
      if (this.state.exam.streak > this.state.exam.bestStreak) {
        this.state.exam.bestStreak = this.state.exam.streak;
      }
      
      // 升级检查
      if (this.state.exam.streak >= this.state.exam.level * 3) {
        this.state.exam.level++;
        feedback.className = 'exam-feedback correct';
        feedback.innerHTML = `🎉 回答正确！<br>连胜 ${this.state.exam.streak} 次！<br><strong>升级到等级 ${this.state.exam.level}！</strong>`;
      } else {
        feedback.className = 'exam-feedback correct';
        feedback.innerHTML = `✅ 回答正确！<br>连胜 ${this.state.exam.streak} 次`;
      }
    } else {
      Sound.playWarning();
      this.state.exam.streak = 0;
      feedback.className = 'exam-feedback wrong';
      feedback.innerHTML = `❌ 回答错误！<br>正确答案是：<strong>${question.correct.style.name}</strong><br>连胜重置`;
    }
    
    // 更新统计
    document.getElementById('exam-streak').textContent = this.state.exam.streak;
    document.getElementById('exam-level').textContent = this.state.exam.level;
    document.getElementById('exam-best').textContent = this.state.exam.bestStreak;
    this.saveExamStats();
    
    // 显示下一题按钮
    document.getElementById('btn-next-question').style.display = 'block';
  },
  
  // ===== 自由酿造模式 =====
  startFreeBrew() {
    // 获取用户选择
    const selectedStyleId = this.state.freeStyle?.id;
    const customOG = parseFloat(document.getElementById('free-og')?.value || 1.050);
    const customIBU = parseInt(document.getElementById('free-ibu')?.value || 30);
    const customSRM = parseInt(document.getElementById('free-srm')?.value || 10);
    const customABV = parseFloat(document.getElementById('free-abv')?.value || 5.0);
    
    // 创建自定义风格或复制选中风格
    let style;
    if (selectedStyleId) {
      // 找到选中的风格
      for (const fam in BJCP_STYLES) {
        const found = BJCP_STYLES[fam].styles.find(s => s.id === selectedStyleId);
        if (found) {
          style = JSON.parse(JSON.stringify(found)); // 深拷贝
          break;
        }
      }
    }
    
    // 如果没有选中风格，创建完全自定义的
    if (!style) {
      const targetFG = customOG - (customABV / 131.25);
      style = {
        id: 'FREE',
        name: '自由酿造',
        nameEn: 'Free Style Brew',
        description: '完全自定义的啤酒配方',
        og: { min: customOG * 0.9, max: customOG * 1.1, target: customOG },
        fg: { min: targetFG * 0.9, max: targetFG * 1.1, target: targetFG },
        ibu: { min: customIBU * 0.7, max: customIBU * 1.3, target: customIBU },
        srm: { min: customSRM * 0.7, max: customSRM * 1.3, target: customSRM },
        abv: { min: customABV * 0.8, max: customABV * 1.2, target: customABV },
        mashTemp: { min: 60, max: 70, ideal: 65 },
        mashTime: { min: 60, max: 90, ideal: 60 },
        boilTime: { min: 60, max: 90, ideal: 60 },
        fermentTemp: { min: 10, max: 25, ideal: 18 },
        fermentTime: { min: 7, max: 21, ideal: 14 },
        malts: Object.keys(INGREDIENTS.malts).map(name => ({
          name,
          color: INGREDIENTS.malts[name].color,
          gravity: INGREDIENTS.malts[name].ppg / 1000 + 1,
          default: false
        })),
        hops: Object.keys(INGREDIENTS.hops).map(name => ({
          name,
          alpha: INGREDIENTS.hops[name].alpha,
          type: INGREDIENTS.hops[name].type,
          region: INGREDIENTS.hops[name].region
        })),
        yeasts: Object.keys(INGREDIENTS.yeasts).map(name => ({
          name,
          attenuation: INGREDIENTS.yeasts[name].attenuation,
          tempMin: INGREDIENTS.yeasts[name].tempMin,
          tempMax: INGREDIENTS.yeasts[name].tempMax
        })),
        optional: ['水果', '香料', '咖啡', '香草', '橡木片'],
        tips: ['自由酿造没有固定规则，尽情发挥创意！']
      };
    }
    
    this.state.selectedStyle = style;
    this.state.selectedFamily = 'free';
    this.state.currentMode = 'free';
    this.state.brewer = { name: '疯狂科学家', avatar: '🔬', catchphrase: '打破规则，创造传奇！' };
    
    this.state.step = 0;
    this.resetBrewState();
    this.toPage('brewing');
  },
  
  // ===== 经典模式（原有功能）=====
  selectFamily(familyKey) {
    Sound.playClick();
    this.state.selectedFamily = familyKey;
    UI.renderStyleList(familyKey);
    this.toPage('style-detail');
  },
  
  selectStyle(style) {
    Sound.playClick();
    this.state.selectedStyle = style;
    UI.renderBrewerSelect(this.state.selectedFamily);
    this.toPage('brewer-select');
  },
  
  selectBrewer(brewer) {
    Sound.playClick();
    this.state.brewer = brewer;
    this.state.step = 0;
    this.resetBrewState();
    this.toPage('brewing');
  },
  
  resetBrewState() {
    const style = this.state.selectedStyle;
    if (!style) return;
    
    this.state.selectedMalts = [];
    this.state.selectedHops = [];
    this.state.selectedYeast = '';
    this.state.selectedFlavors = [];
    this.state.mashTemp = style.mashTemp?.ideal || 65;
    this.state.mashTime = style.mashTime?.ideal || 60;
    this.state.boilTime = style.boilTime?.ideal || 60;
    this.state.fermentTemp = style.fermentTemp?.ideal || 18;
    this.state.fermentTime = style.fermentTime?.ideal || 14;
    this.state.conditionTime = 7;
  },
  
  initBrewing() {
    const style = this.state.selectedStyle;
    if (!style) return;
    
    document.querySelectorAll('.brew-step').forEach((s, i) => {
      s.classList.toggle('active', i === 0);
    });
    
    UI.updateStepIndicator(0);
    UI.renderMashStep(style);
    
    // 初始化动画画布
    const brewingBody = document.getElementById('brewing-body');
    if (brewingBody) {
      Animations.init('brewing-body');
    }
    
    setTimeout(() => {
      const welcomeMsgs = [
        `欢迎来到我的酿酒坊！今天我们要酿造一款${style.name}。`,
        `准备好了吗？${style.name}是一款${style.description?.substring(0, 20) || '独特的啤酒'}...`,
        `好的，让我们开始酿造${style.name}吧！${style.tips?.[0]?.substring(0, 30) || '细节决定成败'}...`
      ];
      const msg = welcomeMsgs[Math.floor(Math.random() * welcomeMsgs.length)];
      UI.showBubble(msg, 'success');
    }, 500);
  },
  
  nextStep() {
    const style = this.state.selectedStyle;
    
    if (this.state.step === 0 && this.state.selectedMalts.length === 0) {
      Sound.playWarning();
      UI.showBubble('至少要选一种麦芽！没有麦芽怎么酿酒？', 'warning');
      return;
    }
    if (this.state.step === 2 && !this.state.selectedYeast) {
      Sound.playWarning();
      UI.showBubble('必须选择酵母！没有酵母啤酒不会发酵。', 'warning');
      return;
    }
    
    // 播放步骤切换音效
    Sound.playClick();
    
    // 播放步骤动画
    if (this.state.step === 0) {
      Animations.playMashing(this.state.selectedMalts.length);
    } else if (this.state.step === 1) {
      Animations.playBoiling(this.state.selectedHops.length);
    } else if (this.state.step === 2) {
      Animations.playFermenting();
    }
    
    this.state.step++;
    
    document.querySelectorAll('.brew-step').forEach((s, i) => {
      s.classList.toggle('active', i === this.state.step);
    });
    UI.updateStepIndicator(this.state.step);
    
    if (this.state.step === 1) {
      UI.renderBoilStep(style);
      UI.showBubble('现在进入煮沸阶段！酒花投放的时机很关键。', 'tip');
    } else if (this.state.step === 2) {
      UI.renderFermentStep(style);
      UI.showBubble('发酵是魔法发生的时刻！温度和酵母选择决定成败。', 'tip');
    } else if (this.state.step === 3) {
      UI.renderFlavorStep(style);
      if (style.optional && style.optional.length > 0) {
        UI.showBubble(`这款风格可以尝试添加：${style.optional.join('、')}。当然也可以什么都不加。`, 'tip');
      } else {
        UI.showBubble('这款传统风格通常不需要额外增味，直接跳过也可以。', 'tip');
      }
    }
    
    window.scrollTo(0, 0);
  },
  
  toggleMalt(maltName) {
    const idx = this.state.selectedMalts.findIndex(m => m.name === maltName);
    if (idx >= 0) {
      this.state.selectedMalts.splice(idx, 1);
      Sound.playClick();
    } else {
      this.state.selectedMalts.push({ name: maltName, weight: 2 });
      Sound.playDrop();
      // 播放麦芽掉落动画
      const maltSelector = document.getElementById('malt-selector');
      if (maltSelector) {
        const btn = maltSelector.querySelector(`[data-malt="${maltName}"]`);
        if (btn) {
          const rect = btn.getBoundingClientRect();
          const container = document.getElementById('brewing-body');
          if (container) {
            const containerRect = container.getBoundingClientRect();
            Animations.createParticle(
              rect.left - containerRect.left + rect.width / 2,
              rect.top - containerRect.top + rect.height / 2,
              'malt',
              { color: '#D4A017', size: 8 }
            );
          }
        }
      }
    }
    UI.updateSelectedMalts();
    this.checkWarnings();
  },
  
  adjustMaltWeight(maltName, delta) {
    const malt = this.state.selectedMalts.find(m => m.name === maltName);
    if (malt) {
      malt.weight = Math.max(1, Math.min(20, malt.weight + delta));
      UI.updateSelectedMalts();
      Sound.playClick();
      this.checkWarnings();
    }
  },
  
  adjustHopWeight(hopName, delta) {
    const hop = this.state.selectedHops.find(h => h.name === hopName);
    if (hop) {
      hop.weight = Math.max(0.25, Math.min(5, hop.weight + delta));
      hop.weight = Math.round(hop.weight * 10) / 10;
      UI.updateSelectedHops();
      Sound.playClick();
      this.checkWarnings();
    }
  },
  
  removeMalt(maltName) {
    this.state.selectedMalts = this.state.selectedMalts.filter(m => m.name !== maltName);
    UI.updateSelectedMalts();
    Sound.playClick();
  },
  
  toggleHop(hopName) {
    const idx = this.state.selectedHops.findIndex(h => h.name === hopName);
    if (idx >= 0) {
      this.state.selectedHops.splice(idx, 1);
      Sound.playClick();
    } else {
      this.state.selectedHops.push({ name: hopName, weight: 1.0, boilTime: this.state.boilTime });
      Sound.playHopDrop();
      // 播放酒花掉落动画
      const hopSelector = document.getElementById('hop-selector');
      if (hopSelector) {
        const btn = hopSelector.querySelector(`[data-hop="${hopName}"]`);
        if (btn) {
          const rect = btn.getBoundingClientRect();
          const container = document.getElementById('brewing-body');
          if (container) {
            const containerRect = container.getBoundingClientRect();
            Animations.createParticle(
              rect.left - containerRect.left + rect.width / 2,
              rect.top - containerRect.top + rect.height / 2,
              'hop',
              { color: '#4CAF50', size: 6 }
            );
          }
        }
      }
    }
    UI.updateSelectedHops();
    this.checkWarnings();
  },
  
  removeHop(hopName) {
    this.state.selectedHops = this.state.selectedHops.filter(h => h.name !== hopName);
    UI.updateSelectedHops();
    Sound.playClick();
  },
  
  selectYeast(yeastName) {
    this.state.selectedYeast = yeastName;
    document.querySelectorAll('#yeast-selector .ingredient-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.querySelector('.ing-name')?.textContent === yeastName);
    });
    Sound.playBubble();
    this.checkWarnings();
  },
  
  toggleFlavor(flavorName) {
    const idx = this.state.selectedFlavors.findIndex(f => f.name === flavorName);
    if (idx >= 0) {
      this.state.selectedFlavors.splice(idx, 1);
      Sound.playClick();
    } else {
      this.state.selectedFlavors.push({ name: flavorName });
      Sound.playDrop();
      // 播放增味动画
      Animations.playFlavoring([flavorName]);
    }
    UI.updateSelectedFlavors();
    this.checkWarnings();
  },
  
  removeFlavor(flavorName) {
    this.state.selectedFlavors = this.state.selectedFlavors.filter(f => f.name !== flavorName);
    UI.updateSelectedFlavors();
    Sound.playClick();
  },
  
  checkWarnings() {
    const style = this.state.selectedStyle;
    if (!style) return;
    
    const warnings = BrewLogic.checkWarnings(style, this.state);
    if (warnings.length > 0) {
      const w = warnings[0];
      UI.showBubble(w.text, w.type);
    }
  },
  
  hideBubble() {
    Sound.playClick();
    UI.hideBubble();
  },
  
  finishBrewing() {
    const style = this.state.selectedStyle;
    if (!style) return;
    
    // 播放完成音效
    Sound.playComplete();
    
    // 播放啤酒倒出动画
    const srm = BrewLogic.calculateSRM(this.state.selectedMalts);
    const beerColor = BrewLogic.srmToColor(srm);
    Animations.playPouring(beerColor, 2000);
    
    const og = BrewLogic.calculateOG(this.state.selectedMalts);
    const yeast = INGREDIENTS.yeasts[this.state.selectedYeast];
    const attenuation = yeast?.attenuation || 0.75;
    const fg = BrewLogic.calculateFG(og, attenuation, this.state.fermentTemp, this.state.fermentTime, this.state.mashTemp);
    const abv = BrewLogic.calculateABV(og, fg);
    const ibu = BrewLogic.calculateIBU(this.state.selectedHops.map(h => ({
      name: h.name,
      weight: h.weight || 0.5,
      boilTime: this.state.boilTime
    })), og);
    // srm已在上面计算
    
    const actual = {
      og, fg, ibu, srm, abv,
      yeastName: this.state.selectedYeast,
      fermentTemp: this.state.fermentTemp,
      fermentTime: this.state.fermentTime,
      mashTemp: this.state.mashTemp,
      creativeBonus: this.calculateCreativeBonus(style)
    };
    
    const score = BrewLogic.calculateScore(style, actual);
    this.state.result = { style, actual, score };
    
    // 学徒模式：记录完成并解锁下一个
    if (this.state.currentMode === 'apprentice') {
      this.completeStyle(style.id, score.total);
    }
    
    this.saveToHistory(style, actual, score);
    UI.renderResult(style, actual, score);
    
    // 播放评分音效
    setTimeout(() => {
      if (score.total >= 80) {
        Sound.playSuccess();
      } else if (score.total >= 60) {
        Sound.playBubble();
      } else {
        Sound.playWarning();
      }
      
      // 语音播报评分
      const comment = BrewLogic.generateComment(style, score, actual);
    }, 1500);
    
    this.toPage('result');
  },
  
  calculateCreativeBonus(style) {
    let bonus = 5;
    
    if (this.state.selectedFlavors.length > 0) {
      const optional = style.optional || [];
      const hasRecommended = this.state.selectedFlavors.some(f => 
        optional.some(o => f.name.includes(o) || o.includes(f.name))
      );
      if (hasRecommended) bonus += 3;
      else bonus -= 2;
    }
    
    const ogTarget = style.og?.target || (style.og?.min + style.og?.max) / 2 || 1.050;
    const og = BrewLogic.calculateOG(this.state.selectedMalts);
    if (Math.abs(og - ogTarget) < 0.005) bonus += 2;
    
    return Math.max(0, Math.min(10, bonus));
  },
  
  saveToHistory(style, actual, score) {
    const history = JSON.parse(localStorage.getItem('brewmaster_history') || '[]');
    history.push({
      id: Date.now(),
      name: '',
      styleName: style.name,
      styleId: style.id,
      family: this.state.selectedFamily,
      score: score.total,
      rating: score.rating.level,
      params: {
        og: actual.og.toFixed(3),
        fg: actual.fg.toFixed(3),
        ibu: Math.round(actual.ibu),
        srm: Math.round(actual.srm),
        abv: actual.abv.toFixed(1)
      },
      date: new Date().toLocaleDateString('zh-CN')
    });
    
    if (history.length > 50) history.shift();
    localStorage.setItem('brewmaster_history', JSON.stringify(history));
  },
  
  generateShareImage() {
    Sound.playClick();
    const name = document.getElementById('beer-name')?.value || '未命名佳酿';
    if (this.state.result) {
      this.state.result.name = name;
      const history = JSON.parse(localStorage.getItem('brewmaster_history') || '[]');
      if (history.length > 0) {
        history[history.length - 1].name = name;
        localStorage.setItem('brewmaster_history', JSON.stringify(history));
      }
    }
    
    Share.generate(this.state, this.state.result);
    this.toPage('share');
  },
  
  downloadShareImage() {
    Sound.playClick();
    Share.download();
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化音效系统
  Sound.init();
  
  // 初始化学徒模式解锁（第一个风格默认解锁）
  const unlocked = JSON.parse(localStorage.getItem('brewmaster_unlocked') || '[]');
  if (unlocked.length === 0) {
    // 默认解锁第一个风格（美式清爽拉格或第一个可用的）
    const firstFamily = Object.keys(BJCP_STYLES)[0];
    const firstStyle = BJCP_STYLES[firstFamily]?.styles[0];
    if (firstStyle) {
      unlocked.push(firstStyle.id);
      localStorage.setItem('brewmaster_unlocked', JSON.stringify(unlocked));
    }
  }
  
  console.log('🍺 精酿啤酒酿造师 已加载');
});

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = game;
}
