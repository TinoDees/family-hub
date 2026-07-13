import { IngredientEditor, type IngredientRow } from "@/components/ingredient-editor";
import { inputCls, buttonCls } from "@/components/auth-card";

export type RecipeFormData = {
  id?: string;
  source_url?: string | null;
  video_path?: string | null;
  name?: string;
  description?: string | null;
  servings?: number;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  instructions?: string | null;
  tags?: string[];
  ingredients?: IngredientRow[];
};

export function RecipeForm({
  action,
  recipe,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  recipe?: RecipeFormData;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      {recipe?.id && <input type="hidden" name="recipe_id" value={recipe.id} />}
      <input type="hidden" name="source_url" value={recipe?.source_url ?? ""} />
      <input type="hidden" name="video_path" value={recipe?.video_path ?? ""} />

      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-64 flex-1">
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input name="name" required defaultValue={recipe?.name} placeholder="e.g. Spaghetti Bolognese" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Serves</label>
            <input name="servings" type="number" min="1" defaultValue={recipe?.servings ?? 4} className={`${inputCls} w-20`} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Prep (min)</label>
            <input name="prep_minutes" type="number" min="0" defaultValue={recipe?.prep_minutes ?? ""} className={`${inputCls} w-24`} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Cook (min)</label>
            <input name="cook_minutes" type="number" min="0" defaultValue={recipe?.cook_minutes ?? ""} className={`${inputCls} w-24`} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <input name="description" defaultValue={recipe?.description ?? ""} placeholder="Family favourite, freezes well" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tags</label>
          <input name="tags" defaultValue={recipe?.tags?.join(", ") ?? ""} placeholder="dinner, beef, quick (comma-separated)" className={inputCls} />
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold">Ingredients</h2>
        <IngredientEditor initial={recipe?.ingredients} />
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold">Method</h2>
        <textarea
          name="instructions"
          rows={8}
          defaultValue={recipe?.instructions ?? ""}
          placeholder={"1. Brown the mince...\n2. Add the sauce..."}
          className={`${inputCls} font-normal`}
        />
      </div>

      <button className={`${buttonCls} w-auto px-8`}>{submitLabel}</button>
    </form>
  );
}
