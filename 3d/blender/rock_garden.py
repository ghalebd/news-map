"""
rock_garden.py — يولّد صخرة فنية عالية الجودة ويصدّرها GLB للاستخدام في واجهة WebGL.

التشغيل (بدون واجهة):
    blender --background --python 3d/blender/rock_garden.py -- --out 3d/assets/rock.glb

الناتج: mesh واحد باسم "Rock" مع:
  • نحت إجرائي (Voronoi + Noise + Musgrave) عبر مُعدِّل Displace بنسيج إجرائي
  • Decimate إلى ميزانية مضلعات مناسبة للويب (~25k مثلث افتراضياً)
  • ألوان رأسية (vertex colors) تحمل الحجر + الطحلب — يقرأها المشهد مباشرة
  • مقياس موحّد: الصخرة داخل صندوق نصف قطره 1.0 تقريباً وقاعدتها عند y=0

ملاحظة: العشب والزهور لا تُصدَّر من بليندر. المشهد في المتصفح ينثرها
instanced على سطح الصخرة (أسرع بكثير من تصدير مئات الآلاف من الشفرات).
"""

import sys
import math
import argparse

import bpy
import bmesh
from mathutils import Vector, noise


# ----------------------------------------------------------------- arguments
def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="3d/assets/rock.glb", help="مسار ملف GLB الناتج")
    p.add_argument("--seed", type=int, default=7, help="بذرة عشوائية لشكل الصخرة")
    p.add_argument("--subdiv", type=int, default=6, help="مستوى تقسيم الكرة الأولية")
    p.add_argument("--tris", type=int, default=25000, help="ميزانية المثلثات بعد Decimate")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# --------------------------------------------------------------- rock shape
def build_rock(seed, subdiv):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=min(subdiv, 7), radius=1.0)
    obj = bpy.context.active_object
    obj.name = "Rock"

    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)

    off = Vector((seed * 3.17, seed * 1.93, seed * 5.11))

    for v in bm.verts:
        n = v.co.normalized()

        # نفس تركيبة التشويش المستخدمة في نسخة الجافاسكربت
        # ليبقى الشكل متقارباً بين النموذجين
        big = noise.fractal(n * 1.15 + off, 0.5, 2.0, 3)
        mid = 1.0 - abs(noise.fractal(n * 3.1 + off, 0.5, 2.07, 4))
        fine = noise.fractal(n * 9.0 + off, 0.5, 2.0, 3)

        r = 1.0 + big * 0.30 + (mid - 0.5) * 0.20 + fine * 0.045

        co = n * r
        co.z *= 0.72          # في بليندر Z للأعلى
        co.x *= 1.12
        co.z += 0.12 * co.x   # ميلان خفيف

        if co.z < -0.18:      # تسطيح القاعدة لتغرس في الأرض
            co.z = -0.18 + (co.z + 0.18) * 0.25

        v.co = co

    bm.to_mesh(me)
    bm.free()

    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(42)
    bpy.ops.object.shade_smooth()
    return obj


# ------------------------------------------------------------ vertex colours
def paint_rock(obj):
    me = obj.data
    if not me.vertex_colors:
        me.vertex_colors.new(name="Col")
    layer = me.vertex_colors.active

    stone = Vector((0.42, 0.415, 0.40))
    dark = Vector((0.18, 0.185, 0.175))
    moss = Vector((0.31, 0.42, 0.20))

    me.calc_normals_split()
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            co = me.vertices[vi].co
            nz = me.vertices[vi].normal.z          # Z-up = "لأعلى"

            grain = noise.fractal(co * 6.5, 0.5, 2.0, 4) * 0.5 + 0.5
            t = max(0.0, min(1.0, grain * 1.35))
            col = dark.lerp(stone, t)

            up = max(0.0, min(1.0, (nz - 0.15) / 0.60))
            up = up * up * (3 - 2 * up)            # smoothstep
            patch = noise.fractal(co * 2.4 + Vector((11, 0, 0)), 0.5, 2.0, 3) * 0.5 + 0.5
            patch = max(0.0, min(1.0, (patch - 0.35) / 0.45))
            col = col.lerp(moss, up * patch * 0.85)

            layer.data[li].color = (col.x, col.y, col.z, 1.0)


# ----------------------------------------------------------------- cleanup
def optimise(obj, tri_budget):
    bpy.context.view_layer.objects.active = obj

    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > tri_budget:
        mod = obj.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = tri_budget / float(tris)
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # قاعدة الصخرة عند z=0 ومركزها فوق نقطة الأصل
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    lowest = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    obj.location.z -= lowest
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_colors=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_yup=True,          # مهم: Three.js يستخدم Y للأعلى
    )


def main():
    args = parse_args()
    clear_scene()
    rock = build_rock(args.seed, args.subdiv)
    paint_rock(rock)
    optimise(rock, args.tris)

    # مادة بسيطة تقرأ الألوان الرأسية — الباقي يُضبط في Three.js
    mat = bpy.data.materials.new("RockMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Metallic"].default_value = 0.02
    attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    rock.data.materials.append(mat)

    export_glb(args.out)
    print("تم التصدير:", args.out)


if __name__ == "__main__":
    main()
