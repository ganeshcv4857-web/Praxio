// Short measured aptitude check. Two items per dimension; each dimension scores
// 0, 50 or 100 and is blended 50/50 with the self-rating in features.js.
// (No programming items: that dimension stays self-rated.)

export const APTITUDE_QUIZ = [
  { dim: 'apt_logical', q: 'All engineers in the lab wear goggles. Priya is not wearing goggles. Which must be true?', opts: ['Priya is an engineer', 'Priya is not an engineer in the lab', 'Nobody in the lab wears goggles', 'Priya is in the lab'], correct: 1 },
  { dim: 'apt_logical', q: 'Next in the sequence: 2, 6, 12, 20, 30, …', opts: ['42', '40', '44', '36'], correct: 0 },
  { dim: 'apt_quant', q: 'A tank fills in 6 hours with pipe A and 3 hours with pipe B. Both together take:', opts: ['1.5 hours', '4.5 hours', '2 hours', '2.5 hours'], correct: 2 },
  { dim: 'apt_quant', q: 'A price rises 20% and then falls 20%. The net change is:', opts: ['0%', '+4%', '−2%', '−4%'], correct: 3 },
  { dim: 'apt_verbal', q: 'Choose the word closest in meaning to “meticulous”:', opts: ['Careless', 'Thorough', 'Quick', 'Bold'], correct: 1 },
  { dim: 'apt_verbal', q: '“The results were ___ — no two runs agreed.” Best fit:', opts: ['inconsistent', 'consistent', 'conclusive', 'redundant'], correct: 0 },
  { dim: 'apt_spatial', q: 'A cube is painted on all faces and cut into 27 equal cubes. How many small cubes have exactly two painted faces?', opts: ['8', '6', '24', '12'], correct: 3 },
  { dim: 'apt_spatial', q: 'Facing north, you turn right, turn right again, then turn left. Which way are you facing?', opts: ['North', 'East', 'South', 'West'], correct: 1 },
];

/** answers: array of chosen option indices (or null). Returns { dim: 0..100 } for answered dims. */
export function scoreQuiz(answers) {
  const byDim = {};
  APTITUDE_QUIZ.forEach((item, i) => {
    if (answers[i] == null) return;
    byDim[item.dim] ??= { right: 0, total: 0 };
    byDim[item.dim].total += 1;
    if (answers[i] === item.correct) byDim[item.dim].right += 1;
  });
  return Object.fromEntries(
    Object.entries(byDim).map(([d, { right, total }]) => [d, Math.round((right / total) * 100)])
  );
}
