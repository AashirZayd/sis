"use server";

export async function submitFeedback(rating: number, comment: string) {
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    throw new Error("Invalid rating: must be between 1 and 5");
  }
  return { success: true, rating, commentLength: comment ? comment.length : 0 };
}
