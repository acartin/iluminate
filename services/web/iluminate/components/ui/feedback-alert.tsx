"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Feedback } from "@/lib/feedback";

const SUCCESS_TIMEOUT_MS = 5000;
const ERROR_TIMEOUT_MS = 8000;

export function FeedbackAlert({ feedback }: { feedback?: Feedback | null }) {
  const [visible, setVisible] = useState(Boolean(feedback));

  useEffect(() => {
    setVisible(Boolean(feedback));
    if (!feedback) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url.toString());

    const timeout = window.setTimeout(
      () => setVisible(false),
      feedback.type === "error" ? ERROR_TIMEOUT_MS : SUCCESS_TIMEOUT_MS
    );

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  if (!feedback || !visible) return null;

  return (
    <Alert variant={feedback.type} title={feedback.type === "error" ? "Could not save" : "Operation completed"}>
      {feedback.message}
    </Alert>
  );
}
