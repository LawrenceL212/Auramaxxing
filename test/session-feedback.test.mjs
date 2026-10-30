/* Tests for session feedback.  Run:  node test/session-feedback.test.mjs */
import { classify, volumeNudges, pendingFeedback, staleFeedbackDates, QUESTIONS } from '../session-feedback.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0; const results = [];
function check(name, ok, detail = '') { ok ? pass++ : fail++; results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`); }
const today = '2026-10-29';
const ago = (n) => shiftDay(today, -n);
const f = (pump, soreness, workload, performance) => ({ pump, soreness, workload, performance });

check('four questions, three options each', QUESTIONS.length === 4 && QUESTIONS.every(q => q.options.length === 3));
check('little pump, little soreness, easy: add', classify(f(1, 1, 1, 2)) === 'add');
check('good pump, manageable soreness: hold', classify(f(2, 2, 2, 2)) === 'hold');
check('excessive soreness and poor recovery: reduce', classify(f(3, 3, 3, 1)) === 'reduce' && classify(f(2, 3, 2, 1)) === 'reduce');
check('too hard and missed the work: reduce', classify(f(2, 2, 3, 1)) === 'reduce');
check('heavy soreness alone while hitting the work: hold', classify(f(3, 3, 2, 2)) === 'hold');
check('two low signals with the work done: add', classify(f(1, 2, 1, 3)) === 'add');
check('easy but the work was missed: not add', classify(f(1, 1, 1, 1)) !== 'add');
check('one low signal is not enough', classify(f(2, 2, 1, 2)) === 'hold');
check('incomplete or invalid ratings classify to nothing', classify({ pump: 1 }) === null && classify(f(1, 1, 1, 4)) === null && classify(null) === null);

const e = (n, groups, ratings) => ({ date: ago(n), groups, ...ratings });
const easy = f(1, 1, 1, 2), hard = f(3, 3, 3, 1), fine = f(2, 2, 2, 2);
const two = volumeNudges({ today, entries: [e(1, ['Chest'], easy), e(4, ['Chest', 'Back'], easy)] });
check('two easy sessions: add a set to the shared group only', two.nudges.Chest === 1 && two.nudges.Back === undefined && /Chest|chest/.test(two.why.Chest));
check('one easy session moves nothing', Object.keys(volumeNudges({ today, entries: [e(1, ['Chest'], easy)] }).nudges).length === 0);
check('an easy then a fine session moves nothing', volumeNudges({ today, entries: [e(1, ['Chest'], fine), e(4, ['Chest'], easy)] }).nudges.Chest === undefined);
check('two hard sessions: take a set away', volumeNudges({ today, entries: [e(1, ['Quads'], hard), e(5, ['Quads'], hard)] }).nudges.Quads === -1);
check('mixed add and reduce cancels out', volumeNudges({ today, entries: [e(1, ['Quads'], hard), e(5, ['Quads'], easy)] }).nudges.Quads === undefined);
check('only the last two sessions of a group count', volumeNudges({ today, entries: [e(1, ['Chest'], fine), e(3, ['Chest'], easy), e(6, ['Chest'], easy)] }).nudges.Chest === undefined);
check('sessions older than 28 days are ignored', volumeNudges({ today, entries: [e(30, ['Chest'], easy), e(35, ['Chest'], easy)] }).nudges.Chest === undefined);
check('future sessions are ignored', volumeNudges({ today, entries: [{ date: shiftDay(today, 2), groups: ['Chest'], ...easy }, e(3, ['Chest'], easy)] }).nudges.Chest === undefined);
check('entries without full ratings are skipped, not counted', volumeNudges({ today, entries: [e(1, ['Chest'], { pump: 1 }), e(3, ['Chest'], easy), e(6, ['Chest'], easy)] }).nudges.Chest === 1);

check('pending: yesterday session without feedback', pendingFeedback({ workoutDates: [ago(1)], feedbackDates: [], today }) === ago(1));
check('pending: already rated is not asked again', pendingFeedback({ workoutDates: [ago(1)], feedbackDates: [ago(1)], today }) === null);
check('pending: a session 3 days ago is too late to ask', pendingFeedback({ workoutDates: [ago(3)], feedbackDates: [], today }) === null);
check('pending: asks about the latest session', pendingFeedback({ workoutDates: [ago(2), today], feedbackDates: [], today }) === today);
check('stale feedback dates are listed for pruning', staleFeedbackDates({ [ago(61)]: {}, [ago(59)]: {} }, today).join() === ago(61));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
