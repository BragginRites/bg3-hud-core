import { BG3Component } from "../component.js";

export class DragBar extends BG3Component {
    constructor(data, parent) {
        super(data, parent);
        
        // Track drag state
        this.isDragging = false;
        this.startX = 0;
        this.startLeftCols = 0;
        this.startRightCols = 0;
        this.totalCols = 0;
        this.cellWidth = 0;
        this.deltaX = 0;
    }

    get classes() {
        return ['bg3-drag-bar'];
    }

    get indicator() {
        return this.element.querySelector('.drag-indicator');
    }

    get index() {
        return this.data.index;
    }
    
    // Define event handlers
    handleMouseMove(e) {
      if (!this.isDragging) return;
      
      // Calculate the delta in pixels
      const deltaX = e.clientX - this.startX;
      
      // Calculate the delta in columns (can be fractional)
      const deltaColsFractional = this.deltaX / this.cellWidth;
      
      // Calculate potential new column counts
      const newLeftCols = this.startLeftCols + deltaColsFractional;
      const newRightCols = this.startRightCols - deltaColsFractional;
      
      // Only proceed if both containers would have at least 1 column
      if (newLeftCols >= 0 && newRightCols >= 0) {
        this.deltaX = deltaX;
        // Update the drag indicator position
        this.indicator.style.transform = `translateX(${this.deltaX}px)`;
      }
    };

    handleMouseUp(e) {
        if (!this.isDragging) return;
        
        // Calculate the final delta
        // const deltaX = e.clientX - this.startX;
        const deltaColsFractional = this.deltaX / this.cellWidth;
        
        // Round to the nearest column
        const deltaColsRounded = Math.round(deltaColsFractional);
        
        // Only apply changes if we've moved at least half a column
        if (Math.abs(deltaColsFractional) >= 0.5) {
          // Calculate new column counts
          const newLeftCols = Math.max(0, this.startLeftCols + deltaColsRounded);
          const newRightCols = Math.max(0, this.startRightCols - deltaColsRounded);
          
          // Update both containers' column counts
          ui.BG3HOTBAR.components.container.components.hotbar[this.index].data.cols = newLeftCols;
          ui.BG3HOTBAR.components.container.components.hotbar[this.index + 1].data.cols = newRightCols;
          
          // Render both containers with new column counts
          ui.BG3HOTBAR.components.container.components.hotbar[this.index].render();
          ui.BG3HOTBAR.components.container.components.hotbar[this.index + 1].render();
          
          // Save the changes
          ui.BG3HOTBAR.manager.persist();
        }
        
        // Clean up
        this.isDragging = false;
        this.indicator.classList.remove('visible');
        this.indicator.style.transform = '';
        this.element.classList.remove('dragging');
        document.body.classList.remove('dragging-active');
        ui.BG3HOTBAR.element[0].classList.remove('dragging-in-progress');
        
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    };

    async _registerEvents() {
        // Mouse down event to start dragging
        this.element.addEventListener("mousedown", async (e) => {
            e.preventDefault();
            
            // Initialize drag state
            this.isDragging = true;
            this.startX = e.clientX;
            this.deltaX = 0;
            this.startLeftCols = ui.BG3HOTBAR.components.container.components.hotbar[this.index].data.cols;
            this.startRightCols = ui.BG3HOTBAR.components.container.components.hotbar[this.index + 1].data.cols;
            this.totalCols = this.startLeftCols + this.startRightCols;
            
            // Get the cell width from the container
            const leftContainerRect = ui.BG3HOTBAR.components.container.components.hotbar[this.index].element.getBoundingClientRect(),
                rightContainerRect = ui.BG3HOTBAR.components.container.components.hotbar[this.index + 1].element.getBoundingClientRect();
            this.cellWidth = Math.max(leftContainerRect.width / Math.max(this.startLeftCols, 1), rightContainerRect.width / Math.max(this.startRightCols, 1));
            
            // Add visual feedback classes
            this.element.classList.add('dragging');
            this.indicator.classList.add('visible');
            document.body.classList.add('dragging-active');
            ui.BG3HOTBAR.element[0].classList.add('dragging-in-progress');
            
            document.addEventListener('mousemove', this.handleMouseMove.bind(this));
            document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        });
    }
}