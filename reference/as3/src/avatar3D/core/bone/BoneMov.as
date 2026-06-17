package avatar3D.core.bone 
{
	import avatar3D.core.BoneParameter;
	import away3d.containers.Bone;
	import caurina.transitions.Tweener;
	/**
	 * ...
	 * @author S
	 */
	public class BoneMov implements BoneParameter
	{
		private var bone:Bone;
		
		private var min:Number;
		private var def:Number;
		private var max:Number;
		
		private var currentWeight:Number;
		private var nextWeight:Number;
		
		
		public function BoneMov(bone:Bone, xml:XMLList) {
			this.bone = bone;
			
			if (xml.length() > 0) {
				var num:Number = xml.@def;
				this.def = bone.x + num;
				this.min = xml.@min;
				this.max = xml.@max;
				
				this.currentWeight = xml.@inertia;
				this.nextWeight = 1.0 - this.currentWeight;
				
				bone.x = this.def;
			} else {
				def = max = min = bone.x;
				this.currentWeight = 0.0;
				this.nextWeight = 1.0;
			}
		}
		
		
		public function set value(value:Number):void {
			bone.x *= currentWeight;
			
			if (value > 0) {
				if (value > 1.0) value = 1.0;
				
				bone.x += nextWeight * (def + max * value);
			} else if (value < 0) {
				value = -value;
				if (value > 1.0) value = 1.0;
				
				bone.x += nextWeight * (def + min * value);
			} else {
				bone.x += nextWeight * def;
			}
		}
		
		public function get value():Number {
			return bone.x;
		}
		
		
		public function refreshValue(change:Number):void {
			bone.x *= (nextWeight * change + currentWeight);
		}
		
		public function setValueTween(value:Number, time:Number, delay:Number = 0.0, transition:String = "linear"):void {
			var target:Number = 0.0;
			if (value > 0) {
				if (value > 1.0) value = 1.0;
				
				target = def + max * value;
			} else if (value < 0) {
				value = -value;
				if (value > 1.0) value = 1.0;
				
				target = def + min * value;
			} else {
				target = def;
			}
			
			Tweener.addTween(bone, { x:target, time:time, delay:delay, transition:transition } );
		}
		
	}
}