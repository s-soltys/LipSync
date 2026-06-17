package util 
{
	/**
	 * ...
	 * @author S
	 */
	public class LookAtPoint
	{
		public var x:Number;
		public var y:Number;
		
		private var nextWeight:Number;
		private var currentWeight:Number;
		
		public function LookAtPoint(inertia:Number) {
			currentWeight = inertia;
			nextWeight = 1.0 - inertia;
		}
		
		public function lookAt(x:Number, y:Number):void {
			this.x = this.x * currentWeight + x * nextWeight;
			this.y = this.y * currentWeight + y * nextWeight;
		}
		
	}
}