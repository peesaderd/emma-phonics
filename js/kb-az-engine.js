/*!
 * Kidobits A-Z Master Interactive Controller
 * Non-invasive DOM-delegated Phonics Engine
 * SCOPE: STRICTLY azPlayer Screen. Instantly stops and cleans up outside azPlayer.
 */
(function() {
  'use strict';

  if (window.__KB_AZ_INITIALIZED__) return;
  window.__KB_AZ_INITIALIZED__ = true;

  console.log('[Kidobits A-Z] Engine initialized');

  function isAZScreen() {
    if (!document.body) return false;
    var t = document.body.innerText || '';
    return t.includes('● สอนโฟนิกส์ • ตัวอักษร') || t.includes('EMMA A-Z PHONICS MONITOR');
  }

  var PHONICS = {
    'A': { word: 'apple', thai: 'แอะ', alts: ['apple', 'apples', 'แอปเปิ้ล', 'แอะ', 'a', 'เอ'] },
    'B': { word: 'ball', thai: 'เบอะ', alts: ['ball', 'balls', 'บอล', 'เบอะ', 'b', 'บี'] },
    'C': { word: 'cat', thai: 'เคอะ', alts: ['cat', 'cats', 'แคท', 'เคอะ', 'c', 'ซี'] },
    'D': { word: 'dog', thai: 'เดอะ', alts: ['dog', 'dogs', 'ด็อก', 'เดอะ', 'd', 'ดี'] },
    'E': { word: 'egg', thai: 'เอะ', alts: ['egg', 'eggs', 'เอ้ก', 'เอะ', 'e', 'อี'] },
    'F': { word: 'fish', thai: 'เฟอะ', alts: ['fish', 'fishes', 'ฟิช', 'เฟอะ', 'f', 'เอฟ'] },
    'G': { word: 'goat', thai: 'เกอะ', alts: ['goat', 'goats', 'โกท', 'เกอะ', 'g', 'จี'] },
    'H': { word: 'hat', thai: 'เฮอะ', alts: ['hat', 'hats', 'แฮท', 'เฮอะ', 'h', 'เอช'] },
    'I': { word: 'insect', thai: 'อิ', alts: ['insect', 'insects', 'อินเซก', 'อิ', 'i', 'ไอ'] },
    'J': { word: 'jam', thai: 'เจอะ', alts: ['jam', 'jams', 'แยม', 'เจอะ', 'j', 'เจ'] },
    'K': { word: 'kite', thai: 'เคอะ', alts: ['kite', 'kites', 'ไคท์', 'เคอะ', 'k', 'เค'] },
    'L': { word: 'log', thai: 'เลอะ', alts: ['log', 'logs', 'ล็อก', 'เลอะ', 'l', 'แอล'] },
    'M': { word: 'moon', thai: 'เมอะ', alts: ['moon', 'moons', 'มูน', 'เมอะ', 'm', 'เอ็ม'] },
    'N': { word: 'net', thai: 'เนอะ', alts: ['net', 'nets', 'เน็ต', 'เนอะ', 'n', 'เอ็น'] },
    'O': { word: 'octopus', thai: 'เอาะ', alts: ['octopus', 'อ็อกโทพุส', 'เอาะ', 'o', 'โอ'] },
    'P': { word: 'pig', thai: 'เพอะ', alts: ['pig', 'pigs', 'พิก', 'เพอะ', 'p', 'พี'] },
    'Q': { word: 'queen', thai: 'ควะ', alts: ['queen', 'queens', 'ควีน', 'ควะ', 'q', 'คิว'] },
    'R': { word: 'robot', thai: 'เรอะ', alts: ['robot', 'robots', 'โรบอท', 'เรอะ', 'r', 'อาร์'] },
    'S': { word: 'sun', thai: 'ซือ', alts: ['sun', 'suns', 'ซัน', 'ซือ', 's', 'เอส'] },
    'T': { word: 'tin', thai: 'เทอะ', alts: ['tin', 'tins', 'ทิน', 'เทอะ', 't', 'ที'] },
    'U': { word: 'umbrella', thai: 'อะ', alts: ['umbrella', 'umbrellas', 'อัมเบรลล่า', 'อะ', 'u', 'ยู'] },
    'V': { word: 'van', thai: 'เวอะ', alts: ['van', 'vans', 'แวน', 'เวอะ', 'v', 'วี'] },
    'W': { word: 'web', thai: 'เวอะ', alts: ['web', 'webs', 'เว็บ', 'เวอะ', 'w', 'ดับเบิลยู'] },
    'X': { word: 'fox', thai: 'คส์', alts: ['fox', 'foxes', 'box', 'ฟ็อกซ์', 'คส์', 'x', 'เอ็กซ์'] },
    'Y': { word: 'yo-yo', thai: 'เยอะ', alts: ['yo-yo', 'yoyo', 'โยโย่', 'เยอะ', 'y', 'วาย'] },
    'Z': { word: 'zebra', thai: 'ซึ', alts: ['zebra', 'zebras', 'ม้าลาย', 'ซีบรา', 'ซึ', 'z', 'แซด', 'ซี'] }
  };

  var PRAISES = [
    '/kidobits/audio/praise_good_1.mp3',
    '/kidobits/audio/praise_good_2.mp3',
    '/kidobits/audio/praise_perfect_1.mp3',
    '/kidobits/audio/praise_perfect_2.mp3',
    '/kidobits/audio/praise_1.mp3'
  ];

  var AudioMgr = {
    currentAudio: null,
    unlocked: false,
    unlock: function() {
      if (this.unlocked) return;
      this.unlocked = true;
      try {
        var silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silent.play().catch(function() {});
      } catch (e) {}
    },
    stop: function() {
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
          this.currentAudio.onended = null;
          this.currentAudio.onerror = null;
        } catch (e) {}
        this.currentAudio = null;
      }
    },
    play: function(url, onEnded, onBlocked) {
      this.stop();
      this.unlock();
      var a = new Audio(url);
      this.currentAudio = a;
      var endedCalled = false;
      function done() {
        if (endedCalled) return;
        endedCalled = true;
        if (onEnded) onEnded();
      }
      a.onended = done;
      a.onerror = done;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function(err) {
          console.warn('[AudioMgr] Play blocked or failed:', err);
          if (onBlocked) {
            onBlocked(err);
          } else {
            // Do not force onEnded if blocked so we don't open mic in silence
          }
        });
      }
    }
  };

  // Global touch / click unlock listeners for zero-friction audio
  window.addEventListener('pointerdown', function() { AudioMgr.unlock(); }, { capture: true, passive: true });
  window.addEventListener('click', function() { AudioMgr.unlock(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', function() { AudioMgr.unlock(); }, { capture: true, passive: true });

  var currentLetter = null;
  var isListening = false;
  var activeStream = null;
  var activeRecorder = null;
  var audioContext = null;
  var analyser = null;
  var volInterval = null;
  var autoAdvanceTimer = null;

  function getDOMElements() {
    var buttons = Array.from(document.querySelectorAll('button'));
    var hearBtn = buttons.find(function(b) {
      return b.innerText.includes('ฟังเสียง') || b.innerText.includes('🔊');
    });
    var micBtn = buttons.find(function(b) {
      return b.className.includes('bg-[#FF5B6A]') && b.innerText.includes('🎙️');
    });
    var nextBtn = buttons.find(function(b) {
      return b.innerText.includes('Next');
    });
    var prevBtn = buttons.find(function(b) {
      return b.innerText.includes('Prev');
    });
    var keyBtns = buttons.filter(function(b) {
      return b.innerText.length === 1 && b.innerText >= 'A' && b.innerText <= 'Z';
    });
    var activeKeyBtn = keyBtns.find(function(b) {
      return b.className.includes('bg-black') || b.className.includes('text-white');
    });

    return {
      hearBtn: hearBtn,
      micBtn: micBtn,
      nextBtn: nextBtn,
      prevBtn: prevBtn,
      keyBtns: keyBtns,
      activeKeyBtn: activeKeyBtn
    };
  }

  function updateMicVisuals(vol, text) {
    if (!isAZScreen()) return;
    var bars = document.querySelectorAll('div.bg-\\[\\#FF5B6A\\].rounded-full');
    bars.forEach(function(bar) {
      if (bar.style) bar.style.width = Math.min(100, Math.max(0, vol)) + '%';
    });

    var pTags = Array.from(document.querySelectorAll('p'));
    var volP = pTags.find(function(p) { return p.innerText.includes('ระดับเสียงไมค์:'); });
    if (volP) {
      volP.innerText = 'ระดับเสียงไมค์: ' + Math.round(vol) + '%';
    }

    if (text) {
      var feedbackP = pTags.find(function(p) {
        return p.className.includes('font-bold') && p.className.includes('text-sm') && !p.innerText.includes('ระดับเสียงไมค์');
      });
      if (feedbackP) {
        feedbackP.innerText = text;
      }
    }
  }

  function detectCurrentLetter() {
    if (!isAZScreen()) return null;
    var dom = getDOMElements();
    if (dom.activeKeyBtn) return dom.activeKeyBtn.innerText.trim();
    var match = document.body ? document.body.innerText.match(/สอนโฟนิกส์[^\w]*ตัวอักษร\s*([A-Z])/i) : null;
    if (match) return match[1].toUpperCase();
    var match2 = document.body ? document.body.innerText.match(/([A-Z])([a-z])\s*•/) : null;
    if (match2) return match2[1].toUpperCase();
    return null;
  }

  function isMatch(spokenText, letter) {
    if (!spokenText || !letter) return false;
    var norm = spokenText.toLowerCase().trim();
    var info = PHONICS[letter];
    if (!info) return false;
    if (norm === letter.toLowerCase() || norm.includes(letter.toLowerCase())) {
      if (norm.length <= 4) return true;
    }
    for (var i = 0; i < info.alts.length; i++) {
      var alt = info.alts[i].toLowerCase();
      if (norm.includes(alt) || alt.includes(norm)) return true;
    }
    return false;
  }

  function stopMic() {
    isListening = false;
    if (volInterval) { clearInterval(volInterval); volInterval = null; }
    if (activeStream) {
      try { activeStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
      activeStream = null;
    }
    if (activeRecorder && activeRecorder.state === 'recording') {
      try { activeRecorder.stop(); } catch (e) {}
    }
    activeRecorder = null;
    updateMicVisuals(0);
  }

  function startMic(targetLetter) {
    if (!isAZScreen() || !targetLetter) return;
    stopMic();
    isListening = true;

    updateMicVisuals(10, 'ครูเอ็มม่ากำลังฟัง... พูดคำว่า “' + (PHONICS[targetLetter] ? PHONICS[targetLetter].word : targetLetter) + '” ได้เลยค่ะ 🎙️');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateMicVisuals(0, 'บราวเซอร์ไม่รองรับการบันทึกเสียง');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      if (!isListening || !isAZScreen() || currentLetter !== targetLetter) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        return;
      }
      activeStream = stream;

      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioContext = new AC();
          var src = audioContext.createMediaStreamSource(stream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);

          var dataArray = new Uint8Array(analyser.frequencyBinCount);
          volInterval = setInterval(function() {
            if (!isListening || !analyser) return;
            analyser.getByteFrequencyData(dataArray);
            var sum = 0;
            for (var i = 0; i < dataArray.length; i++) sum += dataArray[i];
            var avg = sum / dataArray.length;
            var pct = Math.min(100, Math.round((avg / 128) * 100));
            updateMicVisuals(pct);
          }, 80);
        }
      } catch (e) {}

      var mr = new MediaRecorder(stream);
      activeRecorder = mr;
      var chunks = [];

      mr.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      var passed = false;

      mr.onstop = function() {
        if (passed || !isAZScreen() || currentLetter !== targetLetter) return;
        if (chunks.length === 0) return;

        var blob = new Blob(chunks, { type: 'audio/webm' });
        var fd = new FormData();
        fd.append('file', blob, 'audio.webm');
        var targetWord = PHONICS[targetLetter] ? PHONICS[targetLetter].word : targetLetter;
        fd.append('hint', targetWord);

        updateMicVisuals(25, 'กำลังตรวจเสียงอ่าน... ✨');
        fetch('/kidobits/stt', { method: 'POST', body: fd })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (passed || !isAZScreen() || currentLetter !== targetLetter) return;
            var spoken = (data && (data.text || data.transcript || '')) || '';
            if (isMatch(spoken, targetLetter)) {
              handleSuccess(targetLetter, spoken);
            } else {
              updateMicVisuals(0, 'ได้ยิน: “' + spoken + '” (แตะไมค์ 🎙️ ลองใหม่อีกรอบนะคนเก่ง)');
            }
          })
          .catch(function(err) {
            updateMicVisuals(0, 'แตะไมค์ 🎙️ เพื่อลองพูดอีกครั้งนะคะ');
          });
      };

      mr.start();
      setTimeout(function() {
        if (isListening && activeRecorder && activeRecorder.state === 'recording') {
          activeRecorder.stop();
        }
      }, 3500);

    }).catch(function(err) {
      stopMic();
      updateMicVisuals(0, 'กรุณาแตะอนุญาตใช้งานไมโครโฟนเพื่อฝึกพูดนะคะ 🎙️');
    });

    function handleSuccess(letter, text) {
      if (passed || !isAZScreen()) return;
      passed = true;
      stopMic();
      var word = PHONICS[letter] ? PHONICS[letter].word : letter;
      updateMicVisuals(0, 'เก่งมาก! พูดว่า “' + (text || word) + '” 🎉 ถูกต้องค่ะ!');

      var praise = PRAISES[Math.floor(Math.random() * PRAISES.length)];
      AudioMgr.play(praise, function() {
        if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = setTimeout(function() {
          if (!isAZScreen()) return;
          var dom = getDOMElements();
          if (dom.nextBtn && !dom.nextBtn.disabled) {
            console.log('[Kidobits A-Z] Auto Next triggered!');
            dom.nextBtn.click();
          }
        }, 800);
      });
    }
  }

  function onLetterChanged(newLetter) {
    if (!isAZScreen() || !newLetter || newLetter === currentLetter) return;
    currentLetter = newLetter;
    console.log('[Kidobits A-Z] Active Letter changed to:', newLetter);

    stopMic();
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }

    var audioUrl = '/kidobits/audio/' + newLetter + '.mp3';
    updateMicVisuals(0, 'ครูเอ็มม่ากำลังสอนนำ: ' + newLetter + ' ... 🔊');

    AudioMgr.play(audioUrl, function() {
      // Audio ended successfully -> start listening
      setTimeout(function() {
        if (isAZScreen() && currentLetter === newLetter) {
          startMic(newLetter);
        }
      }, 300);
    }, function() {
      // Audio was blocked by browser autoplay policy
      updateMicVisuals(0, 'แตะ 🔊 ฟังเสียง เพื่อฟังครูเอ็มม่าสอนนำนะคะ');
    });
  }

  // Delegated click handler on document
  document.addEventListener('click', function(e) {
    var target = e.target;
    var btn = target.closest ? target.closest('button') : null;
    if (!btn) return;

    var text = btn.innerText.trim();

    // If leaving azPlayer (clicking ← บทเรียน or any nav button)
    if (text.includes('← บทเรียน') || btn.closest('nav')) {
      stopMic();
      AudioMgr.stop();
      currentLetter = null;
      return;
    }

    if (!isAZScreen()) return;

    if (text.includes('ฟังเสียง') || text.includes('🔊')) {
      var letter = detectCurrentLetter();
      if (letter) {
        var audioUrl = '/kidobits/audio/' + letter + '.mp3';
        AudioMgr.play(audioUrl, function() {
          setTimeout(function() {
            if (isAZScreen() && currentLetter === letter) {
              startMic(letter);
            }
          }, 300);
        });
      }
      return;
    }

    if (btn.className.includes('bg-[#FF5B6A]') && text.includes('🎙️')) {
      e.stopPropagation();
      var letter = detectCurrentLetter();
      if (letter) {
        if (isListening) {
          stopMic();
          updateMicVisuals(0, 'หยุดไมค์แล้ว แตะเพื่อเริ่มใหม่');
        } else {
          startMic(letter);
        }
      }
      return;
    }

    if (text.length === 1 && text >= 'A' && text <= 'Z') {
      setTimeout(function() {
        var letter = detectCurrentLetter();
        if (letter && letter !== currentLetter) {
          onLetterChanged(letter);
        }
      }, 50);
      return;
    }

    if (text.includes('Next') || text.includes('Prev')) {
      setTimeout(function() {
        var letter = detectCurrentLetter();
        if (letter && letter !== currentLetter) {
          onLetterChanged(letter);
        }
      }, 50);
      return;
    }
  }, true);

  // Background monitor loop
  setInterval(function() {
    if (!isAZScreen()) {
      if (currentLetter !== null) {
        currentLetter = null;
        stopMic();
        AudioMgr.stop();
      }
      return;
    }
    var letter = detectCurrentLetter();
    if (letter && letter !== currentLetter) {
      onLetterChanged(letter);
    }
  }, 400);

})();
