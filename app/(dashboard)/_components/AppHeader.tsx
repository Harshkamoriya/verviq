"use client";

import React from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";

export default function AppHeader() {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="flex h-16 items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </header>
    );
  }

  const greeting = user?.firstName
    ? `Welcome back, ${user.firstName}`
    : "Welcome back";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Practice coach
            </span>

            <motion.h1
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="truncate text-lg font-semibold tracking-tight text-foreground"
            >
              {greeting}
            </motion.h1>
          </div>

          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonAvatarBox:
                    "h-10 w-10 rounded-lg border border-border shadow-sm hover:bg-secondary transition-colors",
                  userButtonPopoverCard: "border border-border shadow-lg rounded-lg",
                },
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
