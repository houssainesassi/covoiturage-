"use client";
import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Like useActionState, but submits through onSubmit so React does not reset
 * the form's fields after the action (users keep their input when a server
 * validation error is returned).
 */
export function useFormAction<S>(action: (prev: S | null, fd: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState(action, null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}
