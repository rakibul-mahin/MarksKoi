"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { offeringInputSchema } from "@/lib/schemas";
import { SEASONS, type SeasonValue } from "@/lib/academic";
import { createOfferingAction } from "@/server/actions/faculty";

type FormIn = z.input<typeof offeringInputSchema>;
type FormOut = z.output<typeof offeringInputSchema>;

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function NewCourseForm({ defaultSeason, defaultYear }: { defaultSeason: SeasonValue; defaultYear: number }) {
  const router = useRouter();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(offeringInputSchema),
    defaultValues: { courseCode: "", courseTitle: "", season: defaultSeason, year: defaultYear, section: "", description: "" },
  });
  const { register, handleSubmit, formState, setError, setValue, watch } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    const result = await createOfferingAction(values);
    if (!result.ok) {
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as keyof FormIn, { message });
      }
      toast.error(result.error);
      return;
    }
    toast.success("Course created. Next, connect your spreadsheet.");
    router.push(`/faculty/courses/${result.data.id}/assessments`);
  });

  const years = [defaultYear - 1, defaultYear, defaultYear + 1];
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="courseCode">Course code</Label>
          <Input id="courseCode" placeholder="CSE110" autoComplete="off" aria-invalid={!!errors.courseCode} aria-describedby="courseCode-error" className="tabular uppercase" {...register("courseCode")} />
          <FieldError id="courseCode-error" message={errors.courseCode?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="courseTitle">Course title</Label>
          <Input id="courseTitle" placeholder="Programming Language I" aria-invalid={!!errors.courseTitle} aria-describedby="courseTitle-error" {...register("courseTitle")} />
          <FieldError id="courseTitle-error" message={errors.courseTitle?.message} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="season">Semester</Label>
          <Select value={watch("season")} onValueChange={(v) => setValue("season", v as SeasonValue, { shouldValidate: true })}>
            <SelectTrigger id="season" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Select value={String(watch("year"))} onValueChange={(v) => setValue("year", Number(v), { shouldValidate: true })}>
            <SelectTrigger id="year" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="section">Section</Label>
          <Input id="section" placeholder="01" autoComplete="off" aria-invalid={!!errors.section} aria-describedby="section-error" className="tabular" {...register("section")} />
          <FieldError id="section-error" message={errors.section?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Note for students <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="description" rows={3} placeholder="For example: consultation hours, or how marks are weighted." aria-describedby="description-error" {...register("description")} />
        <FieldError id="description-error" message={errors.description?.message} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-rule pt-5">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {formState.isSubmitting ? "Creating…" : "Create course"}
        </Button>
      </div>
    </form>
  );
}
