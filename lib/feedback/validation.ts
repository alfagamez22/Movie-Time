export const FEEDBACK_CATEGORIES = ['Bug or technical issue', 'Design and usability', 'Feature suggestion', 'Content and search', 'Account and sign-in', 'Others'] as const;

export function cleanFeedbackText(value: string): string {
  return value.normalize('NFKC').replace(/[\p{Cf}\p{Cc}]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function feedbackTitleError(title: string): string {
  const cleaned = cleanFeedbackText(title);
  if (!cleaned) return 'Required field';
  if (title.length > 150 || cleaned.length > 150) return 'Use 150 characters or fewer.';
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return 'Include at least one letter or number.';
  return '';
}

export function validateFeedback(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Please complete the feedback form.');
  const { title, description = '', category } = input as Record<string, unknown>;
  if (typeof title !== 'string' || typeof description !== 'string' || typeof category !== 'string') throw new Error('Invalid feedback fields.');
  const titleError = feedbackTitleError(title);
  if (titleError) throw new Error(titleError);
  if (title.length > 150 || description.length > 1000) throw new Error('Title must be at most 150 characters and description at most 1,000 characters.');
  if (!FEEDBACK_CATEGORIES.some((item) => item === category)) throw new Error('Please choose a category.');
  const cleanedTitle = cleanFeedbackText(title);
  const cleanedDescription = cleanFeedbackText(description);
  if (cleanedTitle.length > 150 || cleanedDescription.length > 1000) throw new Error('Feedback exceeds the character limit.');
  return { title: cleanedTitle, description: cleanedDescription, category };
}
