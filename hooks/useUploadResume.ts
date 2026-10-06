"use client";

import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";

export interface UploadResumeOptions {
  jobRole?: string;
  coachId?: string;
  onSuccess?: (data: UploadResumeResult) => void;
}

export interface UploadResumeResult {
  success: boolean;
  resumeId: string;
  documentId: string;
}

export const useUploadResume = (options?: UploadResumeOptions) => {
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("resume", file);
      if (options?.jobRole) formData.append("jobRole", options.jobRole);
      if (options?.coachId) formData.append("coachId", options.coachId);

      const res = await axios.post(`/api/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data as UploadResumeResult;
    },
    onMutate: () => {
      toast.loading("Uploading resume...");
    },
    onSuccess: (data) => {
      toast.dismiss();
      toast.success("Resume uploaded successfully");
      options?.onSuccess?.(data);
    },
    onError: (error: any) => {
      toast.dismiss();
      const data = error.response?.data;
      const message =
        (typeof data === "object" && data?.message) ||
        (typeof data === "string" && !data.startsWith("<!DOCTYPE")
          ? data
          : null) ||
        error.message ||
        "Upload failed";
      toast.error(message);
      console.error("Upload error:", error);
    },
    onSettled: () => {
      toast.dismiss();
    },
  });
};

export const useStartPracticeSession = () => {
  return useMutation({
    mutationFn: async (payload: {
      resumeId: string;
      jobRole: string;
      coachId: string;
    }) => {
      const res = await axios.post("/api/practice/start", payload);
      return res.data as { sessionId: string };
    },
    onMutate: () => {
      toast.loading("Preparing your interview...");
    },
    onSuccess: () => {
      toast.dismiss();
    },
    onError: (error: any) => {
      toast.dismiss();
      const message =
        error.response?.data?.message || error.message || "Failed to start session";
      toast.error(message);
    },
    onSettled: () => {
      toast.dismiss();
    },
  });
};
