"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { fail, type ActionResult } from "./errors";

type FormActionFn = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Turns a failed call to the server (offline, timeout) into a form error instead of the error page. */
export function withNetworkError(action: FormActionFn): FormActionFn {
  return async (prev, fd) => {
    try {
      return await action(prev, fd);
    } catch (e) {
      unstable_rethrow(e); // redirect() must keep working
      return fail("network_error");
    }
  };
}

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
