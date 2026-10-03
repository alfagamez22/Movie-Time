export const FEEDBACK_CATEGORIES = ['Bug or technical issue', 'Design and usability', 'Feature suggestion', 'Content and search', 'Account and sign-in', 'Others'] as const;

export function cleanFeedbackText(value: string): string {
  return value.normalize('NFKC').replace(/[\p{Cf}\p{Cc}]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function validateFeedback(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Please complete the feedback form.');
  const { title, description = '', category } = input as Record<string, unknown>;
  if (typeof title !== 'string' || typeof description !== 'string' || typeof category !== 'string') throw new Error('Invalid feedback fields.');
  if (title.length > 150 || description.length > 1000) throw new Error('Title must be at most 150 characters and description at most 1,000 characters.');
  if (!FEEDBACK_CATEGORIES.some((item) => item === category)) throw new Error('Please choose a category.');
  const cleanedTitle = cleanFeedbackText(title);
  const cleanedDescription = cleanFeedbackText(description);
  if (!/[\p{L}\p{N}]/u.test(cleanedTitle)) throw new Error('Please enter a title with at least one letter or number.');
  if (cleanedTitle.length > 150 || cleanedDescription.length > 1000) throw new Error('Feedback exceeds the character limit.');
  return { title: cleanedTitle, description: cleanedDescription, category };
}
