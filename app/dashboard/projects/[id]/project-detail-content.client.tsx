"use client";

import * as React from "react";
import { useTransition, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  CalendarIcon,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PROJECT_DETAIL_PAGE,
  CREATE_PROJECT_PAGE,
  PROJECTS_PAGE,
  FNB_AMOUNT_PENDING_LABEL,
} from "@/lib/message";
import { getSpaceNameById, ALL_SPACES } from "@/lib/config/config";
import {
  PROJECT_STATUS_UI_SELECTABLE,
  getStatusLabel,
  getStatusColorClass,
  getUiProjectStatus,
} from "@/lib/config/project-status";
import type {
  ProjectWithRentals,
  ProjectStatus,
} from "@/lib/types/project";
import {
  updateProject,
  deleteProject,
  updateProjectStatus,
  deleteRental,
  updateRental,
} from "./actions";
import { cn } from "@/lib/utils";
import { formatRentalDateRangeForTable } from "@/lib/utils/project";
import { computeProjectRentalPendingAmount } from "@/lib/utils/project-rental-pending";
import {
  getEffectiveProjectStatus,
  getTaipeiTodayYmd,
} from "@/lib/utils/project-effective-status";
import {
  buildProjectDetailCsv,
  getProjectDetailCsvFilename,
} from "@/lib/services/project/project-detail-csv.service";
import {
  PROJECT_ACTIVITY_CUSTOM_SENTINEL,
  PROJECT_ACTIVITY_TYPE_OPTIONS,
  PROJECT_ACTIVITY_TYPE_OTHER,
} from "@/lib/constants/project-form";
import { formatEquipmentNeedsLine } from "@/lib/utils/project-equipment-needs";
import {
  DEFAULT_RENTAL_FORM_VALUES,
  editProjectFormSchema,
  formValuesToUpdateInput,
  projectToEditFormValues,
  rentalItemSchema,
  rentalToFormValues,
  type EditProjectFormValues,
  type ProjectRentalFormValues,
} from "@/lib/config/project-form-config";
import { Checkbox } from "@/components/ui/checkbox";

const CURRENCY_FORMATTER = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", { dateStyle: "short" });

function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return format(d, "yyyy/MM/dd HH:mm", { locale: zhTW });
}

/** 設備勾選顯示標籤（詳情／唯讀區與 formatEquipmentNeedsLine 共用） */
const EQUIPMENT_NEEDS_LINE_LABELS = {
  microphone: CREATE_PROJECT_PAGE.labelEquipmentMicrophone,
  extensionCord: CREATE_PROJECT_PAGE.labelEquipmentExtensionCord,
  projector: CREATE_PROJECT_PAGE.labelEquipmentProjector,
  whiteboard: CREATE_PROJECT_PAGE.labelEquipmentWhiteboard,
  noOtherEquipmentNeeds: CREATE_PROJECT_PAGE.labelEquipmentNoOtherNeeds,
} as const;

// 表單 schema 與 mapping helpers 由 lib/config/project-form-config.ts 統一提供（與 create 共用）

interface EditRentalFormDialogProps {
  rental: ProjectWithRentals["rentals"][0];
  onClose: () => void;
  onSuccess: () => void;
}

function EditRentalFormDialog({
  rental,
  onClose,
  onSuccess,
}: EditRentalFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectRentalFormValues>({
    resolver: zodResolver(rentalItemSchema) as Resolver<ProjectRentalFormValues>,
    defaultValues: rentalToFormValues(rental),
  });

  const watchedAmounts = useWatch({
    control: form.control,
    name: ["rentalAmount", "fnbAmount", "paidAmount", "fnbAmountPending"],
  });
  const editRentalFnbPending = useWatch({
    control: form.control,
    name: "fnbAmountPending",
  });

  const handleSubmit = form.handleSubmit((data: ProjectRentalFormValues) => {
    startTransition(async () => {
      const endTrim = data.endDate?.trim() ?? "";
      const result = await updateRental(rental.id, {
        ...data,
        endDate: endTrim ? endTrim : undefined,
        setupMinutesBefore: data.setupMinutesBefore ?? 30,
        teardownMinutesAfter: data.teardownMinutesAfter ?? 30,
        pendingAmount: computeProjectRentalPendingAmount(data),
      });
      if (result.success) {
        onSuccess();
      } else {
        form.setError("root", { message: result.error });
      }
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{PROJECT_DETAIL_PAGE.editRentalTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="spaceIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {CREATE_PROJECT_PAGE.labelSpacesRequired}
                  </FormLabel>
                  <FormControl>
                    <fieldset className="flex flex-wrap gap-3 rounded-md border border-input bg-background px-3 py-2">
                      {ALL_SPACES.map((space) => {
                        const checked = field.value.includes(space.id);
                        return (
                          <label
                            key={space.id}
                            className="flex items-center gap-2 cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? field.value.filter((id) => id !== space.id)
                                  : [...field.value, space.id];
                                field.onChange(next);
                              }}
                              className="rounded border-input"
                            />
                            <span>{space.name}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelDateRequired}
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                            type="button"
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {field.value
                              ? format(
                                  new Date(field.value + "T00:00:00"),
                                  "yyyy / MM / dd",
                                  { locale: zhTW },
                                )
                              : CREATE_PROJECT_PAGE.dateFormat}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value
                              ? new Date(field.value + "T00:00:00")
                              : undefined
                          }
                          onSelect={(d) => {
                            const next = d ? format(d, "yyyy-MM-dd") : "";
                            field.onChange(next);
                            const curEnd = form.getValues("endDate");
                            if (!String(curEnd ?? "").trim()) {
                              form.setValue("endDate", next, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                            }
                          }}
                          locale={zhTW}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{CREATE_PROJECT_PAGE.labelEndDate}</FormLabel>
                    <FormDescription className="text-xs">
                      {CREATE_PROJECT_PAGE.labelEndDateHint}
                    </FormDescription>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                            type="button"
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {field.value
                              ? format(
                                  new Date(field.value + "T00:00:00"),
                                  "yyyy / MM / dd",
                                  { locale: zhTW },
                                )
                              : CREATE_PROJECT_PAGE.dateFormat}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value
                              ? new Date(field.value + "T00:00:00")
                              : undefined
                          }
                          onSelect={(d) =>
                            field.onChange(d ? format(d, "yyyy-MM-dd") : "")
                          }
                          locale={zhTW}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelStartTimeRequired}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="time" step={900} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelEndTimeRequired}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="time" step={900} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="rentalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelRentalAmount}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <FormField
                  control={form.control}
                  name="fnbAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {CREATE_PROJECT_PAGE.labelFnbAmount}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={0}
                          className="tabular-nums"
                          disabled={editRentalFnbPending === true}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fnbAmountPending"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(c) => {
                            const checked = c === true;
                            field.onChange(checked);
                            if (checked) {
                              form.setValue("fnbAmount", 0);
                            }
                          }}
                          aria-label={
                            CREATE_PROJECT_PAGE.labelFnbAmountPending
                          }
                        />
                      </FormControl>
                      <FormLabel className="font-normal leading-none">
                        {CREATE_PROJECT_PAGE.labelFnbAmountPending}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="paidAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{CREATE_PROJECT_PAGE.labelPaidAmount}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>
                  {CREATE_PROJECT_PAGE.labelPendingAmount}
                </FormLabel>
                <div
                  className={cn(
                    "flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm tabular-nums shadow-xs",
                  )}
                  aria-live="polite"
                >
                  {computeProjectRentalPendingAmount({
                    rentalAmount: watchedAmounts?.[0],
                    fnbAmount: watchedAmounts?.[1],
                    paidAmount: watchedAmounts?.[2],
                    fnbAmountPending: watchedAmounts?.[3],
                  })}
                </div>
              </FormItem>
            </div>
            {form.formState.errors.root?.message ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.root.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                {PROJECT_DETAIL_PAGE.buttonCancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    {CREATE_PROJECT_PAGE.submitting}
                  </>
                ) : (
                  PROJECT_DETAIL_PAGE.buttonSave
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface AddRentalFormDialogProps {
  project: ProjectWithRentals;
  onClose: () => void;
  onSuccess: () => void;
}

function AddRentalFormDialog({
  project,
  onClose,
  onSuccess,
}: AddRentalFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectRentalFormValues>({
    resolver: zodResolver(rentalItemSchema) as Resolver<ProjectRentalFormValues>,
    defaultValues: {
      ...DEFAULT_RENTAL_FORM_VALUES,
      spaceIds: [],
      date: "",
      endDate: "",
      startTime: "",
      endTime: "",
    },
  });

  const addRentalWatchedAmounts = useWatch({
    control: form.control,
    name: ["rentalAmount", "fnbAmount", "paidAmount", "fnbAmountPending"],
  });
  const addRentalFnbPending = useWatch({
    control: form.control,
    name: "fnbAmountPending",
  });

  const handleSubmit = form.handleSubmit((data: ProjectRentalFormValues) => {
    startTransition(async () => {
      const baseValues = projectToEditFormValues(project);
      const newRentals = [
        ...project.rentals.map((r) => rentalToFormValues(r)),
        {
          ...data,
          setupMinutesBefore: data.setupMinutesBefore ?? 30,
          teardownMinutesAfter: data.teardownMinutesAfter ?? 30,
        },
      ];
      const payload = formValuesToUpdateInput(
        {
          ...baseValues,
          rentals: newRentals,
        },
        project.projectNotes,
      );
      const result = await updateProject(project.id, payload);
      if (result.success) {
        onSuccess();
      } else {
        form.setError("root", { message: result.error });
      }
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{PROJECT_DETAIL_PAGE.addRentalDialogTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="spaceIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {CREATE_PROJECT_PAGE.labelSpacesRequired}
                  </FormLabel>
                  <FormControl>
                    <fieldset className="flex flex-wrap gap-3 rounded-md border border-input bg-background px-3 py-2">
                      {ALL_SPACES.map((space) => {
                        const checked = field.value.includes(space.id);
                        return (
                          <label
                            key={space.id}
                            className="flex items-center gap-2 cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? field.value.filter((id) => id !== space.id)
                                  : [...field.value, space.id];
                                field.onChange(next);
                              }}
                              className="rounded border-input"
                            />
                            <span>{space.name}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelDateRequired}
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                            type="button"
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {field.value
                              ? format(
                                  new Date(field.value + "T00:00:00"),
                                  "yyyy / MM / dd",
                                  { locale: zhTW },
                                )
                              : CREATE_PROJECT_PAGE.dateFormat}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value
                              ? new Date(field.value + "T00:00:00")
                              : undefined
                          }
                          onSelect={(d) => {
                            const next = d ? format(d, "yyyy-MM-dd") : "";
                            field.onChange(next);
                            const curEnd = form.getValues("endDate");
                            if (!String(curEnd ?? "").trim()) {
                              form.setValue("endDate", next, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                            }
                          }}
                          locale={zhTW}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{CREATE_PROJECT_PAGE.labelEndDate}</FormLabel>
                    <FormDescription className="text-xs">
                      {CREATE_PROJECT_PAGE.labelEndDateHint}
                    </FormDescription>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                            type="button"
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {field.value
                              ? format(
                                  new Date(field.value + "T00:00:00"),
                                  "yyyy / MM / dd",
                                  { locale: zhTW },
                                )
                              : CREATE_PROJECT_PAGE.dateFormat}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value
                              ? new Date(field.value + "T00:00:00")
                              : undefined
                          }
                          onSelect={(d) =>
                            field.onChange(d ? format(d, "yyyy-MM-dd") : "")
                          }
                          locale={zhTW}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelStartTimeRequired}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="time" step={900} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelEndTimeRequired}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="time" step={900} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="rentalAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelRentalAmount}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <FormField
                  control={form.control}
                  name="fnbAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {CREATE_PROJECT_PAGE.labelFnbAmount}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={0}
                          className="tabular-nums"
                          disabled={addRentalFnbPending === true}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fnbAmountPending"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(c) => {
                            const checked = c === true;
                            field.onChange(checked);
                            if (checked) {
                              form.setValue("fnbAmount", 0);
                            }
                          }}
                          aria-label={
                            CREATE_PROJECT_PAGE.labelFnbAmountPending
                          }
                        />
                      </FormControl>
                      <FormLabel className="font-normal leading-none">
                        {CREATE_PROJECT_PAGE.labelFnbAmountPending}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="paidAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{CREATE_PROJECT_PAGE.labelPaidAmount}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        className="tabular-nums"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>
                  {CREATE_PROJECT_PAGE.labelPendingAmount}
                </FormLabel>
                <div
                  className={cn(
                    "flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm tabular-nums shadow-xs",
                  )}
                  aria-live="polite"
                >
                  {computeProjectRentalPendingAmount({
                    rentalAmount: addRentalWatchedAmounts?.[0],
                    fnbAmount: addRentalWatchedAmounts?.[1],
                    paidAmount: addRentalWatchedAmounts?.[2],
                    fnbAmountPending: addRentalWatchedAmounts?.[3],
                  })}
                </div>
              </FormItem>
            </div>
            {form.formState.errors.root?.message ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.root.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                {PROJECT_DETAIL_PAGE.buttonCancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    {CREATE_PROJECT_PAGE.submitting}
                  </>
                ) : (
                  PROJECT_DETAIL_PAGE.buttonSave
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface ProjectDetailContentProps {
  project: ProjectWithRentals;
  adminOptions: { id: string; name: string }[];
}

export function ProjectDetailContent({
  project,
  adminOptions,
}: ProjectDetailContentProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPendingUpdate, startUpdateTransition] = useTransition();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [isPendingDownload, startDownloadTransition] = useTransition();
  const [isPendingStatus, startStatusTransition] = useTransition();
  const [editingRentalId, setEditingRentalId] = useState<string | null>(null);
  const [deletingRentalId, setDeletingRentalId] = useState<string | null>(null);
  const [deleteRentalError, setDeleteRentalError] = useState<string | null>(
    null,
  );
  const [isAddRentalOpen, setIsAddRentalOpen] = useState(false);
  const [isPendingDeleteRental, startDeleteRentalTransition] = useTransition();

  const totalAmount = project.rentals.reduce(
    (sum, r) => sum + r.rentalAmount + r.fnbAmount,
    0,
  );

  const collaPlayContactName =
    adminOptions.find((o) => o.id === project.collaPlayContactId)?.name ??
    project.collaPlayContactId;
  const todayYmd = React.useMemo(() => getTaipeiTodayYmd(), []);
  const statusForUi = getUiProjectStatus(project, todayYmd);
  const effectiveStatusForDisplay = getEffectiveProjectStatus(
    project,
    todayYmd,
  );

  const form = useForm<EditProjectFormValues>({
    resolver: zodResolver(editProjectFormSchema) as Resolver<EditProjectFormValues>,
    defaultValues: projectToEditFormValues(project),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rentals",
  });

  const watchedEditRentals = useWatch({ control: form.control, name: "rentals" });
  const watchedEditActivityPreset = useWatch({
    control: form.control,
    name: "activityTypePreset",
  });
  const showEditActivityCustomDetail =
    watchedEditActivityPreset === PROJECT_ACTIVITY_CUSTOM_SENTINEL ||
    watchedEditActivityPreset === PROJECT_ACTIVITY_TYPE_OTHER;

  const handleEdit = useCallback(() => {
    form.reset(projectToEditFormValues(project));
    setIsEditing(true);
  }, [project, form]);

  const handleSubmit = form.handleSubmit((data: EditProjectFormValues) => {
    const payload = formValuesToUpdateInput(data, project.projectNotes);
    startUpdateTransition(async () => {
      const result = await updateProject(project.id, payload);
      if (result.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        form.setError("root", { message: result.error });
      }
    });
  });

  const handleDeleteConfirm = useCallback(() => {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteProject(project.id);
      if (!result.success) {
        setDeleteError(result.error);
      }
    });
  }, [project.id]);

  const handleDownloadCsv = useCallback(() => {
    startDownloadTransition(async () => {
      const csv = buildProjectDetailCsv(project, collaPlayContactName);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const filename = getProjectDetailCsvFilename(project);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [project, collaPlayContactName]);

  const handleStatusChange = useCallback(
    (newStatus: ProjectStatus) => {
      startStatusTransition(async () => {
        const result = await updateProjectStatus(project.id, newStatus);
        if (result.success) {
          router.refresh();
        }
      });
    },
    [project.id, router],
  );

  const editingRental = editingRentalId
    ? project.rentals.find((r) => r.id === editingRentalId)
    : undefined;

  if (isEditing) {
    return (
      <Form {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(e);
          }}
          className="flex flex-col gap-6"
          noValidate
        >
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {PROJECT_DETAIL_PAGE.sectionCustomer}
              </h2>
            </CardHeader>
            {/* 客戶資訊 */}
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelCustomerNameRequired}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={
                          CREATE_PROJECT_PAGE.placeholderCustomerName
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelPhone}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({CREATE_PROJECT_PAGE.optional})
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        placeholder={CREATE_PROJECT_PAGE.placeholderPhone}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{CREATE_PROJECT_PAGE.labelCompany}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{CREATE_PROJECT_PAGE.labelTaxId}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* 專案資訊 */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {PROJECT_DETAIL_PAGE.sectionProject}
              </h2>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {/* 狀態 */}
              {statusForUi ? (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>{PROJECT_DETAIL_PAGE.labelStatus}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROJECT_STATUS_UI_SELECTABLE.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {PROJECTS_PAGE[opt.labelKey]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {/* 活動類型 */}
              <FormField
                control={form.control}
                name="activityTypePreset"
                render={({ field }) => (
                  <FormItem
                    className={cn(
                      "min-w-0",
                      !statusForUi && "sm:col-span-2",
                    )}
                  >
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelActivityType}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      name={field.name}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              CREATE_PROJECT_PAGE.placeholderSelectActivityType
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROJECT_ACTIVITY_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                        <SelectItem value={PROJECT_ACTIVITY_CUSTOM_SENTINEL}>
                          自訂（不在上列）
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showEditActivityCustomDetail ? (
                <FormField
                  control={form.control}
                  name="activityCustomDetail"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>
                        {CREATE_PROJECT_PAGE.labelActivityTypeOtherDetail}{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={
                            CREATE_PROJECT_PAGE.placeholderActivityTypeOtherDetail
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {/* 活動名稱 */}
              <FormField
                control={form.control}
                name="eventOrVenueUse"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel aria-required>
                      {CREATE_PROJECT_PAGE.labelEventOrVenueUseRequired}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={CREATE_PROJECT_PAGE.placeholderEventOrVenueUse}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fnbItems"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{CREATE_PROJECT_PAGE.labelFnb}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} className="resize-none" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* CollaPlay 接洽人 */}
              <FormField
                control={form.control}
                name="collaPlayContactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelCollaPlayContactRequired}
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              CREATE_PROJECT_PAGE.placeholderSelectContact
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {adminOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {PROJECT_DETAIL_PAGE.sectionEquipment}
              </h2>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="totalAttendees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel aria-required>
                      {CREATE_PROJECT_PAGE.labelTotalAttendeesRequired}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        {...field}
                        placeholder={CREATE_PROJECT_PAGE.placeholderAttendees}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tables"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel aria-required>
                      {CREATE_PROJECT_PAGE.labelTablesRequired}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={CREATE_PROJECT_PAGE.placeholderTables}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="chairs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel aria-required>
                      {CREATE_PROJECT_PAGE.labelChairsRequired}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        {...field}
                        placeholder={CREATE_PROJECT_PAGE.placeholderChairs}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2 space-y-3">
                <p className="text-sm font-medium leading-none">
                  {CREATE_PROJECT_PAGE.labelEquipmentExtras}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <FormField
                    control={form.control}
                    name="equipmentNeeds.microphone"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              field.onChange(on);
                              if (on) {
                                form.setValue(
                                  "equipmentNeeds.noOtherEquipmentNeeds",
                                  false,
                                );
                              }
                            }}
                            aria-label={
                              CREATE_PROJECT_PAGE.labelEquipmentMicrophone
                            }
                          />
                        </FormControl>
                        <FormLabel className="font-normal leading-none">
                          {CREATE_PROJECT_PAGE.labelEquipmentMicrophone}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="equipmentNeeds.extensionCord"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              field.onChange(on);
                              if (on) {
                                form.setValue(
                                  "equipmentNeeds.noOtherEquipmentNeeds",
                                  false,
                                );
                              }
                            }}
                            aria-label={
                              CREATE_PROJECT_PAGE.labelEquipmentExtensionCord
                            }
                          />
                        </FormControl>
                        <FormLabel className="font-normal leading-none">
                          {CREATE_PROJECT_PAGE.labelEquipmentExtensionCord}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="equipmentNeeds.projector"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              field.onChange(on);
                              if (on) {
                                form.setValue(
                                  "equipmentNeeds.noOtherEquipmentNeeds",
                                  false,
                                );
                              }
                            }}
                            aria-label={
                              CREATE_PROJECT_PAGE.labelEquipmentProjector
                            }
                          />
                        </FormControl>
                        <FormLabel className="font-normal leading-none">
                          {CREATE_PROJECT_PAGE.labelEquipmentProjector}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="equipmentNeeds.whiteboard"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              field.onChange(on);
                              if (on) {
                                form.setValue(
                                  "equipmentNeeds.noOtherEquipmentNeeds",
                                  false,
                                );
                              }
                            }}
                            aria-label={
                              CREATE_PROJECT_PAGE.labelEquipmentWhiteboard
                            }
                          />
                        </FormControl>
                        <FormLabel className="font-normal leading-none">
                          {CREATE_PROJECT_PAGE.labelEquipmentWhiteboard}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="equipmentNeeds.noOtherEquipmentNeeds"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              field.onChange(on);
                              if (on) {
                                form.setValue(
                                  "equipmentNeeds.microphone",
                                  false,
                                );
                                form.setValue(
                                  "equipmentNeeds.extensionCord",
                                  false,
                                );
                                form.setValue(
                                  "equipmentNeeds.projector",
                                  false,
                                );
                                form.setValue(
                                  "equipmentNeeds.whiteboard",
                                  false,
                                );
                              }
                            }}
                            aria-label={
                              CREATE_PROJECT_PAGE.labelEquipmentNoOtherNeeds
                            }
                          />
                        </FormControl>
                        <FormLabel className="font-normal leading-none">
                          {CREATE_PROJECT_PAGE.labelEquipmentNoOtherNeeds}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 告示 */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {PROJECT_DETAIL_PAGE.sectionNotice}
              </h2>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="needsPrintedNotice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel aria-required>
                      {CREATE_PROJECT_PAGE.labelNeedsPrintedNotice}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={field.value === true}
                            onChange={() => field.onChange(true)}
                            className="accent-primary"
                          />
                          是
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={field.value === false}
                            onChange={() => field.onChange(false)}
                            className="accent-primary"
                          />
                          否
                        </label>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {PROJECT_DETAIL_PAGE.sectionNotes}
              </h2>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="internalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {CREATE_PROJECT_PAGE.labelInternalNotes}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        className="resize-none"
                        placeholder={
                          CREATE_PROJECT_PAGE.placeholderInternalNotes
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {CREATE_PROJECT_PAGE.sectionRentals}
              </h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {fields.map((fieldItem, index) => (
                <div
                  key={fieldItem.id}
                  className="rounded-lg border border-border bg-muted/30 p-4 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium tabular-nums">
                      第 {index + 1} 筆
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      disabled={fields.length <= 1}
                      aria-label={CREATE_PROJECT_PAGE.removeRentalAria}
                    >
                      <Trash2 className="size-4" />
                      {CREATE_PROJECT_PAGE.removeRental}
                    </Button>
                  </div>
                  <FormField
                    control={form.control}
                    name={`rentals.${index}.spaceIds`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {CREATE_PROJECT_PAGE.labelSpacesRequired}
                        </FormLabel>
                        <FormControl>
                          <fieldset className="flex flex-wrap gap-3 rounded-md border border-input bg-background px-3 py-2">
                            {ALL_SPACES.map((space) => {
                              const checked = field.value.includes(space.id);
                              return (
                                <label
                                  key={space.id}
                                  className="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? field.value.filter(
                                            (id) => id !== space.id,
                                          )
                                        : [...field.value, space.id];
                                      field.onChange(next);
                                    }}
                                    className="rounded border-input"
                                  />
                                  <span>{space.name}</span>
                                </label>
                              );
                            })}
                          </fieldset>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`rentals.${index}.date`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {CREATE_PROJECT_PAGE.labelDateRequired}
                          </FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground",
                                  )}
                                  type="button"
                                >
                                  <CalendarIcon className="mr-2 size-4" />
                                  {field.value
                                    ? format(
                                        new Date(field.value + "T00:00:00"),
                                        "yyyy / MM / dd",
                                        { locale: zhTW },
                                      )
                                    : CREATE_PROJECT_PAGE.dateFormat}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={
                                  field.value
                                    ? new Date(field.value + "T00:00:00")
                                    : undefined
                                }
                                onSelect={(d) => {
                                  const next = d ? format(d, "yyyy-MM-dd") : "";
                                  field.onChange(next);
                                  const endPath =
                                    `rentals.${index}.endDate` as const;
                                  const curEnd = form.getValues(endPath);
                                  if (!String(curEnd ?? "").trim()) {
                                    form.setValue(endPath, next, {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    });
                                  }
                                }}
                                locale={zhTW}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rentals.${index}.endDate`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {CREATE_PROJECT_PAGE.labelEndDate}
                          </FormLabel>
                          <FormDescription className="text-xs">
                            {CREATE_PROJECT_PAGE.labelEndDateHint}
                          </FormDescription>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground",
                                  )}
                                  type="button"
                                >
                                  <CalendarIcon className="mr-2 size-4" />
                                  {field.value
                                    ? format(
                                        new Date(field.value + "T00:00:00"),
                                        "yyyy / MM / dd",
                                        { locale: zhTW },
                                      )
                                    : CREATE_PROJECT_PAGE.dateFormat}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-auto p-0"
                              align="start"
                            >
                              <Calendar
                                mode="single"
                                selected={
                                  field.value
                                    ? new Date(field.value + "T00:00:00")
                                    : undefined
                                }
                                onSelect={(d) =>
                                  field.onChange(
                                    d ? format(d, "yyyy-MM-dd") : "",
                                  )
                                }
                                locale={zhTW}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rentals.${index}.startTime`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {CREATE_PROJECT_PAGE.labelStartTimeRequired}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} type="time" step={900} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rentals.${index}.endTime`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {CREATE_PROJECT_PAGE.labelEndTimeRequired}
                          </FormLabel>
                          <FormControl>
                            <Input {...field} type="time" step={900} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      control={form.control}
                      name={`rentals.${index}.rentalAmount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {CREATE_PROJECT_PAGE.labelRentalAmount}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min={0}
                              className="tabular-nums"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex min-w-0 flex-col gap-2">
                      <FormField
                        control={form.control}
                        name={`rentals.${index}.fnbAmount`}
                        render={({ field }) => {
                          const pending =
                            watchedEditRentals?.[index]?.fnbAmountPending ===
                            true;
                          return (
                            <FormItem>
                              <FormLabel>
                                {CREATE_PROJECT_PAGE.labelFnbAmount}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  min={0}
                                  className="tabular-nums"
                                  disabled={pending}
                                  value={field.value ?? ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                      <FormField
                        control={form.control}
                        name={`rentals.${index}.fnbAmountPending`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={(c) => {
                                  const checked = c === true;
                                  field.onChange(checked);
                                  if (checked) {
                                    form.setValue(
                                      `rentals.${index}.fnbAmount`,
                                      0,
                                    );
                                  }
                                }}
                                aria-label={
                                  CREATE_PROJECT_PAGE.labelFnbAmountPending
                                }
                              />
                            </FormControl>
                            <FormLabel className="font-normal leading-none">
                              {CREATE_PROJECT_PAGE.labelFnbAmountPending}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`rentals.${index}.paidAmount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {CREATE_PROJECT_PAGE.labelPaidAmount}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min={0}
                              className="tabular-nums"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormItem>
                      <FormLabel>
                        {CREATE_PROJECT_PAGE.labelPendingAmount}
                      </FormLabel>
                      <div
                        className={cn(
                          "flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm tabular-nums shadow-xs",
                        )}
                        aria-live="polite"
                      >
                        {computeProjectRentalPendingAmount(
                          watchedEditRentals?.[index] ?? {
                            rentalAmount: 0,
                            fnbAmount: 0,
                            paidAmount: 0,
                            fnbAmountPending: false,
                          },
                        )}
                      </div>
                    </FormItem>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ ...DEFAULT_RENTAL_FORM_VALUES })}
                className="w-fit gap-2"
              >
                <Plus className="size-4" />
                {CREATE_PROJECT_PAGE.addRental}
              </Button>
            </CardContent>
          </Card>

          {form.formState.errors.root?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditing(false)}
              disabled={isPendingUpdate}
            >
              {PROJECT_DETAIL_PAGE.buttonCancel}
            </Button>
            <Button type="submit" disabled={isPendingUpdate}>
              {isPendingUpdate ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {CREATE_PROJECT_PAGE.submitting}
                </>
              ) : (
                PROJECT_DETAIL_PAGE.buttonSave
              )}
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  return (
    <div className="min-w-0 flex flex-col gap-6">
      {editingRental ? (
        <EditRentalFormDialog
          key={editingRental.id}
          rental={editingRental}
          onClose={() => setEditingRentalId(null)}
          onSuccess={() => {
            setEditingRentalId(null);
            router.refresh();
          }}
        />
      ) : null}
      {isAddRentalOpen ? (
        <AddRentalFormDialog
          project={project}
          onClose={() => setIsAddRentalOpen(false)}
          onSuccess={() => {
            setIsAddRentalOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {deleteError ? (
        <p
          className="text-sm text-destructive rounded-md bg-destructive/10 p-3"
          role="alert"
        >
          {PROJECT_DETAIL_PAGE.deleteError}: {deleteError}
        </p>
      ) : null}
      {deleteRentalError ? (
        <p
          className="text-sm text-destructive rounded-md bg-destructive/10 p-3"
          role="alert"
        >
          {PROJECT_DETAIL_PAGE.deleteRentalError}: {deleteRentalError}
        </p>
      ) : null}
      <div className="flex justify-between">
        {/* Status Selector */}
        {statusForUi ? (
          <div className="flex items-center gap-2">
            <Select
              value={statusForUi}
              onValueChange={(v) => handleStatusChange(v as ProjectStatus)}
              disabled={isPendingStatus}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS_UI_SELECTABLE.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span
                      className={cn(
                        "mr-2 inline-block size-2 rounded-full",
                        opt.colorClass,
                      )}
                      aria-hidden
                    />
                    {PROJECTS_PAGE[opt.labelKey]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isPendingStatus ? (
              <Loader2
                className="size-4 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>
        ) : null}
        {/* Header Buttons */}
        <div className="flex flex-wrap justify-end gap-2">
          {/* Edit Button */}
          <Button
            variant="default"
            size="sm"
            className="gap-2"
            onClick={handleEdit}
          >
            <Pencil className="size-4" />
            <span className="hidden md:block">
              {PROJECT_DETAIL_PAGE.buttonEdit}
            </span>
          </Button>
          {/* Delete Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                disabled={isPendingDelete}
              >
                {isPendingDelete ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                <span className="hidden md:block">
                  {PROJECT_DETAIL_PAGE.buttonDelete}
                </span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {PROJECT_DETAIL_PAGE.deleteConfirmTitle}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {PROJECT_DETAIL_PAGE.deleteConfirmDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError ? (
                <p className="text-sm text-destructive" role="alert">
                  {deleteError}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {PROJECT_DETAIL_PAGE.deleteConfirmCancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteConfirm}
                  disabled={isPendingDelete}
                >
                  {isPendingDelete ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {PROJECT_DETAIL_PAGE.deleteConfirmConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isPendingDownload}
            onClick={handleDownloadCsv}
          >
            {isPendingDownload ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            <span className="hidden md:block">
              {PROJECT_DETAIL_PAGE.buttonDownloadCsv}
            </span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-w-0 grid gap-6 md:grid-cols-2">
        {/* Customer Information Card */}
        <Card className="min-w-0">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {PROJECT_DETAIL_PAGE.sectionCustomer}
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {project.referenceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelReferenceNumber}
                </p>
                <p className="font-mono font-medium">{project.referenceNumber}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelCustomerName}
              </p>
              <p className="font-medium">{project.customerName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelPhone}
              </p>
              <p className="font-medium">{project.customerPhone}</p>
            </div>
            {project.company ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelCompany}
                </p>
                <p className="font-medium">{project.company}</p>
              </div>
            ) : null}
            {project.taxId ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelTaxId}
                </p>
                <p className="font-medium">{project.taxId}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Project Information Card */}
        <Card className="min-w-0">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {PROJECT_DETAIL_PAGE.sectionProject}
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelActivityType}
              </p>
              <p className="font-medium">{project.eventType}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelEventOrVenueUse}
              </p>
              <p className="font-medium whitespace-pre-wrap">
                {project.eventOrVenueUse}
              </p>
            </div>
            {/* Status */}
            {statusForUi ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelStatus}
                </p>
                <p className="font-medium flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      getStatusColorClass(effectiveStatusForDisplay),
                    )}
                    aria-hidden
                  />
                  {getStatusLabel(effectiveStatusForDisplay)}
                </p>
              </div>
            ) : null}
            {project.fnbItems ? (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelFnb}
                </p>
                <p className="font-medium whitespace-pre-wrap">
                  {project.fnbItems}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelCollaPlayContact}
              </p>
              <p className="font-medium">{collaPlayContactName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelCreatedAt}
              </p>
              <p className="font-medium tabular-nums">
                {formatDateTime(project.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelUpdatedAt}
              </p>
              <p className="font-medium tabular-nums">
                {formatDateTime(project.updatedAt)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 設備需求（唯讀） */}
        <Card className="min-w-0">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {PROJECT_DETAIL_PAGE.sectionEquipment}
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {project.totalAttendees != null ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelTotalAttendees}
                </p>
                <p className="font-medium">{project.totalAttendees}</p>
              </div>
            ) : null}
            {project.tables ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelTables}
                </p>
                <p className="font-medium">{project.tables}</p>
              </div>
            ) : null}
            {project.chairs != null ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {PROJECT_DETAIL_PAGE.labelChairs}
                </p>
                <p className="font-medium">{project.chairs}</p>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelEquipmentSummary}
              </p>
              <p className="font-medium">
                {formatEquipmentNeedsLine(
                  project.equipmentNeeds,
                  EQUIPMENT_NEEDS_LINE_LABELS,
                ) ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 告示（唯讀） */}
        <Card className="min-w-0">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {PROJECT_DETAIL_PAGE.sectionNotice}
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {PROJECT_DETAIL_PAGE.labelNeedsPrintedNotice}
            </p>
            <p className="font-medium">
              {project.needsPrintedNotice ? "是" : "否"}
            </p>
          </CardContent>
        </Card>

        {/* Notes Card */}
        {project.internalNotes ? (
          <Card className="min-w-0 md:col-span-2">
            <CardHeader>
              <h2 className="text-lg font-semibold">
                {PROJECT_DETAIL_PAGE.sectionNotes}
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {PROJECT_DETAIL_PAGE.labelInternalNotes}
              </p>
              <p className="font-medium whitespace-pre-wrap">
                {project.internalNotes}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Rentals Card */}
        <Card className="min-w-0 md:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold">
              {PROJECT_DETAIL_PAGE.sectionRentals}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {PROJECT_DETAIL_PAGE.totalAmount}:{" "}
              {CURRENCY_FORMATTER.format(totalAmount)}
            </p>
          </CardHeader>
          <CardContent>
            {project.rentals.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted-foreground text-sm">尚無租借項目</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setIsAddRentalOpen(true)}
                  aria-label={PROJECT_DETAIL_PAGE.addRentalLabel}
                >
                  <Plus className="size-4" />
                  {PROJECT_DETAIL_PAGE.addRentalLabel}
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{PROJECT_DETAIL_PAGE.labelDate}</TableHead>
                    <TableHead>{PROJECT_DETAIL_PAGE.labelTimeRange}</TableHead>
                    <TableHead>{PROJECT_DETAIL_PAGE.labelSpaces}</TableHead>
                    <TableHead className="text-right tabular-nums">
                      {PROJECT_DETAIL_PAGE.labelRentalAmount}
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      {PROJECT_DETAIL_PAGE.labelFnbAmount}
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      {PROJECT_DETAIL_PAGE.labelPaidAmount}
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      {PROJECT_DETAIL_PAGE.labelPendingAmount}
                    </TableHead>
                    <TableHead className="w-[100px]">
                      {PROJECT_DETAIL_PAGE.labelOperations}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.rentals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">
                        {formatRentalDateRangeForTable(r, (d) =>
                          DATE_FORMATTER.format(d),
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.startTime} – {r.endTime}
                      </TableCell>
                      <TableCell>
                        {r.spaceIds
                          .map((id) => getSpaceNameById(id))
                          .join("、")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {CURRENCY_FORMATTER.format(r.rentalAmount)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          r.fnbAmountPending
                            ? "text-muted-foreground"
                            : "tabular-nums",
                        )}
                      >
                        {r.fnbAmountPending
                          ? FNB_AMOUNT_PENDING_LABEL
                          : CURRENCY_FORMATTER.format(r.fnbAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {CURRENCY_FORMATTER.format(r.paidAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {CURRENCY_FORMATTER.format(r.pendingAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={PROJECT_DETAIL_PAGE.editRentalTitle}
                            onClick={() => setEditingRentalId(r.id)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {project.rentals.length > 1 ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive hover:text-destructive"
                                  aria-label={
                                    CREATE_PROJECT_PAGE.removeRentalAria
                                  }
                                  disabled={
                                    deletingRentalId === r.id ||
                                    isPendingDeleteRental
                                  }
                                >
                                  {deletingRentalId === r.id ||
                                  isPendingDeleteRental ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {
                                      PROJECT_DETAIL_PAGE.deleteRentalConfirmTitle
                                    }
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {
                                      PROJECT_DETAIL_PAGE.deleteRentalConfirmDescription
                                    }
                                    {` （${formatRentalDateRangeForTable(r, (d) => DATE_FORMATTER.format(d))} ${r.startTime}–${r.endTime}）`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {PROJECT_DETAIL_PAGE.deleteConfirmCancel}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      setDeleteRentalError(null);
                                      setDeletingRentalId(r.id);
                                      startDeleteRentalTransition(async () => {
                                        const result = await deleteRental(r.id);
                                        setDeletingRentalId(null);
                                        if (result.success) {
                                          router.refresh();
                                        } else {
                                          setDeleteRentalError(result.error);
                                        }
                                      });
                                    }}
                                    disabled={isPendingDeleteRental}
                                  >
                                    {isPendingDeleteRental ? (
                                      <>
                                        <Loader2 className="size-4 animate-spin mr-2" />
                                        {
                                          PROJECT_DETAIL_PAGE.deleteConfirmConfirm
                                        }
                                      </>
                                    ) : (
                                      PROJECT_DETAIL_PAGE.deleteConfirmConfirm
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground"
                              disabled
                              aria-label="至少需保留一筆租借"
                              title="至少需保留一筆租借"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-12 border-t border-dashed bg-muted/20"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mx-auto gap-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setIsAddRentalOpen(true)}
                        aria-label={PROJECT_DETAIL_PAGE.addRentalLabel}
                      >
                        <Plus className="size-4" />
                        {PROJECT_DETAIL_PAGE.addRentalLabel}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
