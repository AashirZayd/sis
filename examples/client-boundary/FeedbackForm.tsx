"use client";

import { submitFeedback } from "./actions";

export function FeedbackForm() {
  return (
    <form action={async (formData) => {
      const rating = Number(formData.get("rating"));
      const comment = String(formData.get("comment") ?? "");
      await submitFeedback(rating, comment);
    }}>
      <input name="rating" type="number" min="1" max="5" defaultValue="5" />
      <textarea name="comment" placeholder="Your thoughts..." />
      <button type="submit">Submit Feedback</button>
    </form>
  );
}
