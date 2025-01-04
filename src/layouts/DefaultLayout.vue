<template>
  <div class="default-layout">
    <TopMenu />
    <slot /> <!-- Allows content to be projected into the layout -->
  </div>
</template>

<script>
import TopMenu from "@/components/TopMenu.vue";

export default {
  components: {
    TopMenu,
  },
};
</script>

<style>
.default-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
</style>
