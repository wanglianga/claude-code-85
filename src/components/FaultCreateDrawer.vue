<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFaultViewer } from '@/composables/useFaultViewer'
import { useFaultsStore } from '@/stores/faults'
import { useBranchStore } from '@/stores/branch'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { deviceTypeMeta } from '@/data/meta'
import { uid } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import type { FaultPhoto } from '@/types'

const viewer = useFaultViewer()
const faults = useFaultsStore()
const branch = useBranchStore()
const system = useSystemStore()
const auth = useAuthStore()
const toast = useToast()

const device = computed(() =>
  viewer.createDeviceId.value ? branch.devices.find((d) => d.id === viewer.createDeviceId.value) : null
)

const faultDesc = ref('')
const affectedCount = ref(0)
const affectedDesc = ref('')
const maintainerName = ref('赵工（设备维护）')
const maintainerPhone = ref('138****6677')
const maintainerCompany = ref('市图书馆设备运维中心（24 小时报修）')
const photos = ref<FaultPhoto[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

function pickFiles() {
  fileInput.value?.click()
}
function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  for (const f of files.slice(0, 4)) {
    const reader = new FileReader()
    reader.onload = () => {
      photos.value.push({
        id: uid('p'),
        name: f.name,
        dataUrl: String(reader.result),
        takenAt: system.now,
        note: ''
      })
    }
    reader.readAsDataURL(f)
  }
}
function removePhoto(id: string) {
  photos.value = photos.value.filter((p) => p.id !== id)
}

function submit() {
  if (!device.value) return
  if (!faultDesc.value.trim()) {
    toast.bad('请填写故障现象')
    return
  }
  // report 内部自动生成设备故障事件并与工单互相关联
  const r = faults.report({
    libraryId: system.currentLibraryId,
    deviceId: device.value.id,
    faultDesc: faultDesc.value,
    photos: photos.value,
    affectedReaderCount: affectedCount.value,
    affectedDesc: affectedDesc.value,
    maintainerName: maintainerName.value,
    maintainerPhone: maintainerPhone.value,
    maintainerCompany: maintainerCompany.value,
    reporter: auth.account?.name ?? '工作人员',
    at: system.now
  })
  toast.ok('故障工单已创建，照片/联系人/影响已登记')
  viewer.closeCreate()
  viewer.open(r.id)
  faultDesc.value = ''
  affectedCount.value = 0
  affectedDesc.value = ''
  photos.value = []
}
</script>

<template>
  <template v-if="device">
    <div class="drawer-mask" @click="viewer.closeCreate()"></div>
    <aside class="drawer" style="width:560px">
      <div class="drawer-hd">
        <div class="row">
          <span style="font-size:20px">🛠️</span>
          <div>
            <h3 style="font-size:16px">上报设备故障工单</h3>
            <div class="small muted mt8">{{ device.name }}（{{ deviceTypeMeta[device.type] }}）· {{ device.location }}</div>
          </div>
          <div class="spacer"></div>
          <button class="mini-btn" @click="viewer.closeCreate()">✕</button>
        </div>
      </div>
      <div class="drawer-bd">
        <label class="field">故障现象 *
          <textarea class="input" rows="3" v-model="faultDesc" placeholder="如：消磁器报错 E17，无法完成磁条解除"></textarea>
        </label>
        <div class="card">
          <div class="card-hd"><h3>📷 故障照片</h3>
            <div class="spacer"></div>
            <button class="mini-btn" @click="pickFiles">＋ 上传照片</button>
            <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFiles">
          </div>
          <div class="card-bd row">
            <div v-for="p in photos" :key="p.id" style="position:relative">
              <img :src="p.dataUrl" :alt="p.name" style="width:120px;height:78px;object-fit:cover;border-radius:7px;border:1px solid var(--line)">
              <button class="mini-btn" style="position:absolute;top:2px;right:2px;padding:0 6px" @click="removePhoto(p.id)">✕</button>
              <div class="small muted" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</div>
            </div>
            <span v-if="!photos.length" class="small muted">未上传（可后补，照片会随工单跨日保留）</span>
          </div>
        </div>
        <div class="grid grid-2">
          <label class="field">影响读者（人次）
            <input class="input" type="number" v-model.number="affectedCount" min="0">
          </label>
          <label class="field">报修人
            <input class="input" :value="auth.account?.name ?? ''" disabled>
          </label>
        </div>
        <label class="field">影响说明
          <input class="input" v-model="affectedDesc" placeholder="如：晚间无法自助借还，6 名读者受影响">
        </label>
        <div class="card" style="box-shadow:none;background:#f8fafd">
          <div class="card-bd">
            <div class="small muted mb8">维修联系人（跨日保留到次日）</div>
            <div class="grid grid-3" style="gap:8px">
              <input class="input" v-model="maintainerName" placeholder="联系人">
              <input class="input" v-model="maintainerPhone" placeholder="电话">
              <input class="input" v-model="maintainerCompany" placeholder="维保单位">
            </div>
          </div>
        </div>
      </div>
      <div class="drawer-ft row">
        <button class="btn ghost" @click="viewer.closeCreate()">取消</button>
        <div class="spacer"></div>
        <button class="btn amber" @click="submit">提交故障工单（同步生成事件）</button>
      </div>
    </aside>
  </template>
</template>
