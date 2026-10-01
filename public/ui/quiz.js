/**
 * The "test yourself" card an explanation can end with, built from a ```quiz
 * block (read by public/domain/quiz.js).
 *
 * It used to be built in app.js with colours written into each element: a
 * light card whose options took the page's text colour, so in dark mode they
 * were white on white, and on a phone the question was painted the card's
 * own colour. Its colours are now the stylesheet's, for each theme
 * (design-system.css, .qjo-quiz), and every word is set as text.
 */
(function (global) {
  'use strict';

  /**
   * @param {{t: (key: string, vars?: object) => string, parse: (raw: string) => unknown}} deps
   */
  function createQuiz({ t, parse }) {
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    function questionBlock(q, index, total, blocks) {
      const block = el('div', 'quiz-question-block');
      block.hidden = index > 0;
      block.append(el('div', 'quiz-progress', t('quizProgress', { n: index + 1, total })), el('div', 'quiz-question-title', q.question));
      block.querySelector('.quiz-question-title').dir = 'auto';
      const list = el('div', 'quiz-options-list');
      const note = el('div', 'quiz-explanation-note');
      note.hidden = true;
      note.setAttribute('role', 'status');
      const next = index < total - 1 ? el('button', 'quiz-next-btn', t('quizNext')) : null;
      const options = q.options.map((text, i) => {
        const button = el('button', 'quiz-option-btn', text);
        button.type = 'button';
        button.dir = 'auto';
        button.addEventListener('click', () => choose(i));
        return button;
      });
      function choose(chosen) {
        options.forEach((button, i) => {
          button.disabled = true;
          // Without a known answer the choice is only shown as chosen.
          button.dataset.state = i === q.correct ? 'correct' : i !== chosen ? 'other' : q.correct >= 0 ? 'wrong' : 'picked';
        });
        note.replaceChildren();
        if (q.correct >= 0) note.append(el('strong', '', chosen === q.correct ? t('quizCorrect') : t('quizWrong')), ' ');
        note.append(q.explanation);
        note.hidden = !note.textContent.trim();
        if (next) next.hidden = false;
      }
      list.append(...options);
      block.append(list, note);
      if (next) {
        next.type = 'button';
        next.hidden = true;
        next.addEventListener('click', () => { block.hidden = true; blocks[index + 1].hidden = false; });
        block.append(next);
      }
      return block;
    }

    /** Turns every quiz placeholder inside an element into its card. */
    function initialize(element) {
      element.querySelectorAll('.interactive-quiz-container:not([data-ready])').forEach((container) => {
        container.dataset.ready = '1';
        let questions = [];
        try {
          questions = global.QjoDomain.quiz.readQuiz(parse(decodeURIComponent(container.dataset.quizConfig || '[]')));
        } catch (error) {
          console.error('Failed to read a quiz block:', error);
        }
        if (!questions.length) return;
        const card = el('div', 'qjo-quiz quiz-card-wrapper');
        const blocks = [];
        questions.forEach((q, i) => blocks.push(questionBlock(q, i, questions.length, blocks)));
        card.append(...blocks);
        container.replaceChildren(card);
      });
    }

    return { initialize };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createQuiz = createQuiz;
})(window);
